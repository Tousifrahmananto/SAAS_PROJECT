import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import { Decimal } from "decimal.js";
import mongoose from "mongoose";
import { z } from "zod";
import { env } from "../config/env.js";
import { writeAudit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { invoiceEmailConfigured, sendInvoiceEmail } from "../lib/invoiceEmail.js";
import { createInvoicePdf, createReceiptPdf } from "../lib/pdf.js";
import {
  createSslCommerzSession,
  initiateSslCommerzRefund,
  sslCommerzConfigured,
  validateSslCommerzPayment
} from "../lib/sslcommerz.js";
import { requireAuth, requirePermission, requireRole } from "../middleware/auth.js";
import { nextSequence } from "../models/Counter.js";
import { Hospital } from "../models/Hospital.js";
import { Charge } from "../models/Charge.js";
import { Encounter } from "../models/Encounter.js";
import { Invoice, Notification, Payment, ReconciliationBatch, Refund } from "../models/Portal.js";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const money = z.coerce.string().regex(/^\d+(\.\d{1,2})?$/).refine((value) => new Decimal(value).greaterThan(0), "Amount must be positive");
const invoiceRecipientFields = {
  patientName: z.string().trim().min(2).max(160),
  patientEmail: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  patientPhone: z.string().trim().min(7).max(30)
};

function decimal(value: unknown) {
  return new Decimal(String(value ?? "0"));
}

function transactionId(prefix: string) {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

function invoicePdfInput(invoice: any, hospital: any) {
  return {
    hospitalName: hospital.name,
    hospitalAddress: hospital.address,
    invoiceNo: invoice.invoiceNo,
    title: invoice.title,
    patientName: invoice.patientName || "Not recorded",
    patientEmail: invoice.patientEmail || "Not recorded",
    patientPhone: invoice.patientPhone || "Not recorded",
    status: invoice.status,
    dueAt: invoice.dueAt,
    items: invoice.items.map((item: any) => ({
      description: item.description,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      vatAmount: item.vatAmount.toString(),
      lineTotal: item.lineTotal.toString()
    })),
    subtotal: invoice.subtotal.toString(),
    discountAmount: invoice.discountAmount.toString(),
    vatAmount: invoice.vatAmount.toString(),
    totalAmount: invoice.totalAmount.toString(),
    paidAmount: invoice.paidAmount.toString(),
    dueAmount: invoice.dueAmount.toString(),
    checkoutUrl: `${env.SERVER_URL}/api/payments/public/checkout/${invoice._id}`
  };
}

async function deliverInvoice(invoice: any) {
  const hospital = await Hospital.findById(invoice.hospital).lean();
  if (!hospital) return { status: "FAILED" as const, error: "Hospital not found" };
  if (!invoiceEmailConfigured()) {
    const error = "Invoice email is not configured";
    await Invoice.findByIdAndUpdate(invoice._id, { $set: { emailDeliveryStatus: "FAILED", emailDeliveryError: error } });
    return { status: "FAILED" as const, error };
  }
  try {
    const pdf = await createInvoicePdf(invoicePdfInput(invoice, hospital));
    const messageId = await sendInvoiceEmail({
      invoiceId: invoice._id.toString(),
      invoiceNo: invoice.invoiceNo,
      hospitalName: hospital.name,
      patientName: invoice.patientName,
      patientEmail: invoice.patientEmail,
      dueAmount: invoice.dueAmount.toString(),
      dueAt: invoice.dueAt,
      pdf
    });
    await Invoice.findByIdAndUpdate(invoice._id, { $set: { emailDeliveryStatus: "SENT", emailSentAt: new Date(), emailMessageId: messageId, emailDeliveryError: "" } });
    return { status: "SENT" as const, messageId };
  } catch (reason) {
    const error = (reason instanceof Error ? reason.message : "Invoice email delivery failed").slice(0, 500);
    await Invoice.findByIdAndUpdate(invoice._id, { $set: { emailDeliveryStatus: "FAILED", emailDeliveryError: error } });
    return { status: "FAILED" as const, error };
  }
}

async function settlePayment(paymentId: string, details: { validationId?: string; bankTransactionId?: string } = {}) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const payment = await Payment.findById(paymentId).session(session);
      if (!payment) throw new AppError(404, "Payment not found", "PAYMENT_NOT_FOUND");
      if (payment.status === "PAID") { result = payment; return; }
      const invoice = await Invoice.findOne({ _id: payment.invoice, hospital: payment.hospital }).session(session);
      if (!invoice) throw new AppError(404, "Invoice not found", "INVOICE_NOT_FOUND");
      const amount = decimal(payment.amount);
      const due = decimal(invoice.dueAmount);
      if (amount.greaterThan(due)) throw new AppError(409, "Payment exceeds the current invoice balance", "PAYMENT_EXCEEDS_DUE");
      const paid = decimal(invoice.paidAmount).plus(amount);
      const nextDue = due.minus(amount);
      payment.status = "PAID";
      payment.paidAt = new Date();
      payment.validationId = details.validationId ?? payment.validationId;
      payment.bankTransactionId = details.bankTransactionId ?? payment.bankTransactionId;
      invoice.paidAmount = mongoose.Types.Decimal128.fromString(paid.toFixed(2));
      invoice.dueAmount = mongoose.Types.Decimal128.fromString(nextDue.toFixed(2));
      invoice.status = nextDue.isZero() ? "PAID" : "UNPAID";
      await payment.save({ session });
      await invoice.save({ session });
      result = payment;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth);
invoiceRouter.get("/", requirePermission("invoices:read"), async (req, res, next) => {
  try {
    await Invoice.updateMany(
      { hospital: req.auth!.hospitalId, status: "UNPAID", dueAt: { $lt: new Date() } },
      { $set: { status: "OVERDUE" } }
    );
    const invoices = await Invoice.find({ hospital: req.auth!.hospitalId }).populate("createdBy", "fullName email").sort({ createdAt: -1 }).lean();
    res.json({ data: invoices });
  } catch (error) { next(error); }
});
invoiceRouter.post("/from-encounter", requireRole("PROVIDER_OWNER", "BILLING_ADMIN", "ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const input = z.object({ encounterId: objectId, title: z.string().trim().min(2).max(180), dueAt: z.coerce.date(), ...invoiceRecipientFields }).strict().parse(req.body);
    const encounter = await Encounter.findOne({ _id: input.encounterId, hospital: req.auth!.hospitalId }).lean();
    if (!encounter) throw new AppError(404, "Encounter not found", "ENCOUNTER_NOT_FOUND");
    const charges = await Charge.find({ hospital: req.auth!.hospitalId, encounter: encounter._id, status: "POSTED", invoice: null }).populate("service", "name").lean();
    if (!charges.length) throw new AppError(409, "This encounter has no uninvoiced posted charges", "NO_INVOICEABLE_CHARGES");
    const items = charges.map((charge) => ({
      charge: charge._id,
      description: typeof charge.service === "object" && charge.service && "name" in charge.service ? String(charge.service.name) : "Hospital service",
      quantity: charge.quantity.toString(),
      unitPrice: charge.unitPrice.toString(),
      discountAmount: charge.discountAmount.toString(),
      vatAmount: charge.vatAmount.toString(),
      lineTotal: charge.netAmount.toString()
    }));
    const subtotal = charges.reduce((sum, charge) => sum.plus(decimal(charge.grossAmount)), new Decimal(0));
    const discount = charges.reduce((sum, charge) => sum.plus(decimal(charge.discountAmount)), new Decimal(0));
    const vat = charges.reduce((sum, charge) => sum.plus(decimal(charge.vatAmount)), new Decimal(0));
    const total = charges.reduce((sum, charge) => sum.plus(decimal(charge.netAmount)), new Decimal(0));
    const sequence = await nextSequence(req.auth!.hospitalId, "invoice");
    const session = await mongoose.startSession();
    let invoice: Awaited<ReturnType<typeof Invoice.create>>[number] | undefined;
    try {
      invoice = await session.withTransaction(async () => {
        const [createdInvoice] = await Invoice.create([{
          hospital: req.auth!.hospitalId,
          invoiceNo: `INV-${new Date().getFullYear()}-${String(sequence).padStart(6, "0")}`,
          title: input.title,
          patientName: input.patientName,
          patientEmail: input.patientEmail,
          patientPhone: input.patientPhone,
          dueAt: input.dueAt,
          status: "UNPAID",
          issuedAt: new Date(),
          items,
          subtotal: subtotal.toFixed(2),
          vatAmount: vat.toFixed(2),
          discountAmount: discount.toFixed(2),
          totalAmount: total.toFixed(2),
          paidAmount: "0.00",
          dueAmount: total.toFixed(2),
          createdBy: req.auth!.userId
        }], { session });
        if (!createdInvoice) throw new AppError(500, "Invoice creation failed", "INVOICE_CREATION_FAILED");
        const update = await Charge.updateMany(
          { _id: { $in: charges.map((charge) => charge._id) }, invoice: null },
          { $set: { invoice: createdInvoice._id, invoicedAt: new Date() } },
          { session }
        );
        if (update.modifiedCount !== charges.length) throw new AppError(409, "Charges changed while the invoice was being created", "CHARGE_CONFLICT");
        return createdInvoice;
      });
    } finally { await session.endSession(); }
    if (!invoice) throw new AppError(500, "Invoice creation failed", "INVOICE_CREATION_FAILED");
    await Notification.create({ hospital: req.auth!.hospitalId, type: "INVOICE", title: "New consolidated invoice", message: `${invoice.invoiceNo} - ${input.title}`, link: "invoices" });
    await writeAudit(req, "CONSOLIDATED_INVOICE_CREATED", "Invoice", invoice._id, invoice.toObject());
    const emailDelivery = await deliverInvoice(invoice);
    res.status(201).json({ data: await Invoice.findById(invoice._id), emailDelivery });
  } catch (error) { next(error); }
});
invoiceRouter.post("/", requireRole("PROVIDER_OWNER", "BILLING_ADMIN", "ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const input = z.object({
      title: z.string().trim().min(2).max(180),
      ...invoiceRecipientFields,
      dueAt: z.coerce.date(),
      status: z.enum(["DRAFT", "UNPAID"]).default("UNPAID"),
      discountAmount: z.coerce.string().regex(/^\d+(\.\d{1,2})?$/).default("0"),
      items: z.array(z.object({
        description: z.string().trim().min(1).max(240),
        quantity: z.coerce.string().regex(/^\d+(\.\d{1,2})?$/).refine((value) => new Decimal(value).greaterThan(0)),
        unitPrice: money,
        vatPercent: z.coerce.string().regex(/^\d+(\.\d{1,2})?$/).default("0")
      })).min(1).max(100)
    }).strict().parse(req.body);
    const items = input.items.map((item) => {
      const base = decimal(item.quantity).mul(item.unitPrice).toDecimalPlaces(2);
      const vat = base.mul(item.vatPercent).div(100).toDecimalPlaces(2);
      return {
        description: item.description,
        quantity: decimal(item.quantity).toFixed(2),
        unitPrice: decimal(item.unitPrice).toFixed(2),
        discountAmount: "0.00",
        vatAmount: vat.toFixed(2),
        lineTotal: base.plus(vat).toFixed(2)
      };
    });
    const subtotal = items.reduce((sum, item) => sum.plus(decimal(item.lineTotal).minus(item.vatAmount)), new Decimal(0));
    const vat = items.reduce((sum, item) => sum.plus(item.vatAmount), new Decimal(0));
    const discount = decimal(input.discountAmount);
    if (discount.greaterThan(subtotal.plus(vat))) throw new AppError(400, "Discount exceeds invoice total", "INVALID_DISCOUNT");
    const total = subtotal.plus(vat).minus(discount).toDecimalPlaces(2);
    const sequence = await nextSequence(req.auth!.hospitalId, "invoice");
    const invoice = await Invoice.create({
      hospital: req.auth!.hospitalId,
      invoiceNo: `INV-${new Date().getFullYear()}-${String(sequence).padStart(6, "0")}`,
      title: input.title,
      patientName: input.patientName,
      patientEmail: input.patientEmail,
      patientPhone: input.patientPhone,
      dueAt: input.dueAt,
      status: input.status,
      issuedAt: input.status === "UNPAID" ? new Date() : null,
      items,
      subtotal: subtotal.toFixed(2),
      vatAmount: vat.toFixed(2),
      discountAmount: discount.toFixed(2),
      totalAmount: total.toFixed(2),
      paidAmount: "0.00",
      dueAmount: total.toFixed(2),
      createdBy: req.auth!.userId
    });
    await Notification.create({ hospital: req.auth!.hospitalId, type: "INVOICE", title: "New invoice", message: `${invoice.invoiceNo} - ${input.title}`, link: "invoices" });
    await writeAudit(req, "INVOICE_CREATED", "Invoice", invoice._id, invoice.toObject());
    const emailDelivery = input.status === "UNPAID" ? await deliverInvoice(invoice) : { status: "NOT_SENT" as const };
    res.status(201).json({ data: await Invoice.findById(invoice._id), emailDelivery });
  } catch (error) { next(error); }
});
invoiceRouter.patch("/:invoiceId/status", requireRole("PROVIDER_OWNER", "BILLING_ADMIN", "ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const params = z.object({ invoiceId: objectId }).parse(req.params);
    const input = z.object({ status: z.enum(["UNPAID", "CANCELLED"]) }).strict().parse(req.body);
    const before = await Invoice.findOne({ _id: params.invoiceId, hospital: req.auth!.hospitalId }).lean();
    if (!before) throw new AppError(404, "Invoice not found", "INVOICE_NOT_FOUND");
    if (!["DRAFT", "UNPAID", "OVERDUE"].includes(before.status)) throw new AppError(409, "Invoice status cannot be changed", "INVALID_INVOICE_STATE");
    const invoice = await Invoice.findByIdAndUpdate(params.invoiceId, { $set: { status: input.status, issuedAt: input.status === "UNPAID" ? new Date() : before.issuedAt } }, { new: true });
    await writeAudit(req, "INVOICE_STATUS_UPDATED", "Invoice", invoice!._id, invoice!.toObject(), before);
    const emailDelivery = input.status === "UNPAID" && before.status === "DRAFT" ? await deliverInvoice(invoice) : undefined;
    res.json({ data: await Invoice.findById(invoice!._id), ...(emailDelivery ? { emailDelivery } : {}) });
  } catch (error) { next(error); }
});
invoiceRouter.patch("/:invoiceId/recipient", requireRole("PROVIDER_OWNER", "BILLING_ADMIN", "ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const params = z.object({ invoiceId: objectId }).parse(req.params);
    const input = z.object(invoiceRecipientFields).strict().parse(req.body);
    const before = await Invoice.findOne({ _id: params.invoiceId, hospital: req.auth!.hospitalId }).lean();
    if (!before) throw new AppError(404, "Invoice not found", "INVOICE_NOT_FOUND");
    const invoice = await Invoice.findByIdAndUpdate(params.invoiceId, { $set: input }, { new: true });
    await writeAudit(req, "INVOICE_RECIPIENT_UPDATED", "Invoice", invoice!._id, input, { patientName: before.patientName, patientEmail: before.patientEmail, patientPhone: before.patientPhone });
    const emailDelivery = ["UNPAID", "OVERDUE"].includes(invoice!.status) ? await deliverInvoice(invoice) : { status: "NOT_SENT" as const };
    res.json({ data: await Invoice.findById(invoice!._id), emailDelivery });
  } catch (error) { next(error); }
});
invoiceRouter.get("/:invoiceId/pdf", requirePermission("invoices:read"), async (req, res, next) => {
  try {
    const params = z.object({ invoiceId: objectId }).parse(req.params);
    const invoice = await Invoice.findOne({ _id: params.invoiceId, hospital: req.auth!.hospitalId }).lean();
    const hospital = await Hospital.findById(req.auth!.hospitalId).lean();
    if (!invoice || !hospital) throw new AppError(404, "Invoice not found", "INVOICE_NOT_FOUND");
    const pdf = await createInvoicePdf(invoicePdfInput(invoice, hospital));
    res.type("application/pdf").attachment(`${invoice.invoiceNo}.pdf`).send(pdf);
  } catch (error) { next(error); }
});

export const paymentRouter = Router();

paymentRouter.post("/sslcommerz/ipn", async (req, res) => {
  try {
    await handleGatewayNotification(req);
    res.status(200).send("OK");
  } catch (error) {
    if (env.NODE_ENV !== "test") console.error("SSLCOMMERZ IPN failed", error);
    res.status(400).send("INVALID");
  }
});

for (const outcome of ["success", "fail", "cancel"] as const) {
  paymentRouter.all(`/sslcommerz/${outcome}`, async (req, res) => {
    const transaction = String(req.body?.tran_id ?? req.query.tran_id ?? "");
    if (outcome === "success") {
      try {
        await handleGatewayNotification(req);
        res.redirect(`${env.CLIENT_ORIGIN}/?payment=success&transaction=${encodeURIComponent(transaction)}`);
      } catch {
        res.redirect(`${env.CLIENT_ORIGIN}/?payment=failed&transaction=${encodeURIComponent(transaction)}`);
      }
      return;
    }
    await Payment.findOneAndUpdate({ transactionId: transaction, status: "INITIATED" }, { $set: { status: "FAILED", failureReason: outcome.toUpperCase() } });
    res.redirect(`${env.CLIENT_ORIGIN}/?payment=${outcome}&transaction=${encodeURIComponent(transaction)}`);
  });
}

paymentRouter.get("/public/checkout/:invoiceId", async (req, res, next) => {
  try {
    const params = z.object({ invoiceId: objectId }).parse(req.params);
    if (!sslCommerzConfigured()) return next(new AppError(503, "Online payment gateway is not configured", "PAYMENT_GATEWAY_UNAVAILABLE"));
    const invoice = await Invoice.findOne({ _id: params.invoiceId, status: { $in: ["UNPAID", "OVERDUE"] } });
    if (!invoice) return next(new AppError(404, "Payable invoice not found", "INVOICE_NOT_FOUND"));
    if (!invoice.patientName || !invoice.patientEmail || !invoice.patientPhone) {
      return next(new AppError(409, "Invoice is missing recipient details", "INVOICE_RECIPIENT_REQUIRED"));
    }
    const hospital = await Hospital.findById(invoice.hospital).lean();
    const id = transactionId("SSL");
    const payment = await Payment.create({
      hospital: invoice.hospital,
      invoice: invoice._id,
      amount: invoice.dueAmount,
      method: "SSLCOMMERZ",
      transactionId: id
    });
    try {
      const session = await createSslCommerzSession({
        transactionId: id,
        amount: invoice.dueAmount.toString(),
        invoiceNo: invoice.invoiceNo,
        customerName: invoice.patientName,
        customerEmail: invoice.patientEmail,
        customerPhone: invoice.patientPhone,
        customerAddress: hospital?.address
      });
      payment.gatewaySession = session.sessionKey;
      await payment.save();
      await writeAudit(req, "PAYMENT_CHECKOUT_STARTED", "Payment", payment._id, { transactionId: id, invoice: invoice._id, method: "SSLCOMMERZ", isPublic: true });
      res.redirect(session.checkoutUrl);
    } catch (error) {
      payment.status = "FAILED";
      payment.failureReason = error instanceof Error ? error.message : "Gateway session failed";
      await payment.save();
      throw error;
    }
  } catch (error) { next(error); }
});

paymentRouter.use(requireAuth);
paymentRouter.get("/config", requirePermission("payments:create"), (_req, res) => {
  const configured = sslCommerzConfigured();
  res.json({
    data: {
      configured,
      mode: env.SSLCOMMERZ_SANDBOX ? "SANDBOX" : "LIVE",
      ready: configured,
      methods: configured ? ["SSLCOMMERZ", "BANGLA_QR"] : []
    }
  });
});
paymentRouter.get("/", requirePermission("payments:read"), async (req, res, next) => {
  try {
    const payments = await Payment.find({ hospital: req.auth!.hospitalId }).populate("invoice", "invoiceNo title totalAmount dueAmount").sort({ createdAt: -1 }).lean();
    res.json({ data: payments });
  } catch (error) { next(error); }
});
paymentRouter.get("/:paymentId/receipt.pdf", requirePermission("payments:read"), async (req, res, next) => {
  try {
    const params = z.object({ paymentId: objectId }).parse(req.params);
    const payment = await Payment.findOne({ _id: params.paymentId, hospital: req.auth!.hospitalId, status: { $in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } }).populate("invoice", "invoiceNo").lean();
    const hospital = await Hospital.findById(req.auth!.hospitalId).lean();
    if (!payment || !hospital) throw new AppError(404, "Paid transaction not found", "PAYMENT_NOT_FOUND");
    const invoice = payment.invoice as unknown as { invoiceNo: string };
    const pdf = await createReceiptPdf({ hospitalName: hospital.name, transactionId: payment.transactionId, invoiceNo: invoice.invoiceNo, amount: payment.amount.toString(), method: payment.method, paidAt: payment.paidAt ?? payment.createdAt });
    res.type("application/pdf").attachment(`receipt-${payment.transactionId}.pdf`).send(pdf);
  } catch (error) { next(error); }
});
paymentRouter.post("/manual", requireRole("CASHIER", "BILLING_ADMIN", "ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const input = z.object({ invoiceId: objectId, amount: money, method: z.enum(["CASH", "BANK"]) }).strict().parse(req.body);
    const invoice = await Invoice.findOne({ _id: input.invoiceId, hospital: req.auth!.hospitalId, status: { $in: ["UNPAID", "OVERDUE"] } });
    if (!invoice) throw new AppError(404, "Payable invoice not found", "INVOICE_NOT_FOUND");
    if (decimal(input.amount).greaterThan(decimal(invoice.dueAmount))) throw new AppError(409, "Payment exceeds invoice balance", "PAYMENT_EXCEEDS_DUE");
    const payment = await Payment.create({
      hospital: req.auth!.hospitalId,
      invoice: invoice._id,
      amount: decimal(input.amount).toFixed(2),
      method: input.method,
      transactionId: transactionId("MANUAL"),
      receivedBy: req.auth!.userId
    });
    await settlePayment(payment._id.toString());
    const settled = await Payment.findById(payment._id);
    await writeAudit(req, "PAYMENT_RECORDED", "Payment", payment._id, settled!.toObject());
    res.status(201).json({ data: settled });
  } catch (error) { next(error); }
});
paymentRouter.post("/checkout/:invoiceId", requirePermission("payments:create"), async (req, res, next) => {
  try {
    const params = z.object({ invoiceId: objectId }).parse(req.params);
    const input = z.object({ method: z.enum(["SSLCOMMERZ", "BANGLA_QR"]).default("SSLCOMMERZ") }).strict().parse(req.body);
    if (!sslCommerzConfigured()) throw new AppError(503, "Online payment gateway is not configured", "PAYMENT_GATEWAY_UNAVAILABLE");
    const invoice = await Invoice.findOne({ _id: params.invoiceId, hospital: req.auth!.hospitalId, status: { $in: ["UNPAID", "OVERDUE"] } });
    if (!invoice) throw new AppError(404, "Payable invoice not found", "INVOICE_NOT_FOUND");
    if (!invoice.patientName || !invoice.patientEmail || !invoice.patientPhone) {
      throw new AppError(409, "Add the invoice patient name, email, and phone before starting payment", "INVOICE_RECIPIENT_REQUIRED");
    }
    const hospital = await Hospital.findById(req.auth!.hospitalId).lean();
    const id = transactionId("SSL");
    const payment = await Payment.create({ hospital: req.auth!.hospitalId, invoice: invoice._id, amount: invoice.dueAmount, method: input.method, transactionId: id, receivedBy: req.auth!.userId });
    try {
      const session = await createSslCommerzSession({
        transactionId: id,
        amount: invoice.dueAmount.toString(),
        invoiceNo: invoice.invoiceNo,
        customerName: invoice.patientName,
        customerEmail: invoice.patientEmail,
        customerPhone: invoice.patientPhone,
        customerAddress: hospital?.address
      });
      const redirectUrl = input.method === "BANGLA_QR" ? session.banglaQrUrl : session.checkoutUrl;
      if (!redirectUrl) throw new AppError(502, "Bangla QR is not enabled for this SSLCOMMERZ merchant account", "BANGLA_QR_UNAVAILABLE");
      payment.gatewaySession = session.sessionKey;
      await payment.save();
      await writeAudit(req, "PAYMENT_CHECKOUT_STARTED", "Payment", payment._id, { transactionId: id, invoice: invoice._id, method: input.method });
      res.status(201).json({ data: payment, redirectUrl, checkoutUrl: session.checkoutUrl, banglaQrUrl: session.banglaQrUrl });
    } catch (error) {
      payment.status = "FAILED";
      payment.failureReason = error instanceof Error ? error.message : "Gateway session failed";
      await payment.save();
      throw error;
    }
  } catch (error) { next(error); }
});

async function handleGatewayNotification(req: Request) {
  const input = z.object({ val_id: z.string().min(1), tran_id: z.string().min(1) }).passthrough().parse({ ...req.query, ...req.body });
  const payment = await Payment.findOne({ transactionId: input.tran_id });
  if (!payment) throw new AppError(404, "Payment not found", "PAYMENT_NOT_FOUND");
  if (payment.status === "PAID") return payment;
  const validation = await validateSslCommerzPayment(input.val_id);
  if (!validation.status || !["VALID", "VALIDATED"].includes(validation.status)) throw new AppError(400, "Gateway validation failed", "PAYMENT_VALIDATION_FAILED");
  if (validation.tran_id !== payment.transactionId || validation.currency !== "BDT" || !decimal(validation.amount).equals(decimal(payment.amount))) {
    throw new AppError(400, "Gateway payment details do not match", "PAYMENT_MISMATCH");
  }
  return settlePayment(payment._id.toString(), { validationId: validation.val_id, bankTransactionId: validation.bank_tran_id });
}

export const refundRouter = Router();
refundRouter.use(requireAuth);
refundRouter.get("/", requirePermission("payments:read"), async (req, res, next) => {
  try {
    const refunds = await Refund.find({ hospital: req.auth!.hospitalId }).populate("payment requestedBy approvedBy", "transactionId amount method fullName email").sort({ createdAt: -1 }).lean();
    res.json({ data: refunds });
  } catch (error) { next(error); }
});
refundRouter.post("/", requirePermission("payments:refund"), async (req, res, next) => {
  try {
    const input = z.object({ paymentId: objectId, amount: money, reason: z.string().trim().min(3).max(300) }).strict().parse(req.body);
    const payment = await Payment.findOne({ _id: input.paymentId, hospital: req.auth!.hospitalId, status: { $in: ["PAID", "PARTIALLY_REFUNDED"] } });
    if (!payment) throw new AppError(404, "Refundable payment not found", "PAYMENT_NOT_FOUND");
    const existing = await Refund.find({ payment: payment._id, status: { $in: ["REQUESTED", "APPROVED", "PROCESSING", "REFUNDED"] } }).lean();
    const committed = existing.reduce((sum, refund) => sum.plus(decimal(refund.amount)), new Decimal(0));
    if (committed.plus(input.amount).greaterThan(decimal(payment.amount))) throw new AppError(409, "Refund exceeds the refundable amount", "REFUND_EXCEEDS_PAYMENT");
    const refund = await Refund.create({ hospital: req.auth!.hospitalId, payment: payment._id, amount: decimal(input.amount).toFixed(2), reason: input.reason, requestedBy: req.auth!.userId });
    await writeAudit(req, "REFUND_REQUESTED", "Refund", refund._id, refund.toObject());
    res.status(201).json({ data: refund });
  } catch (error) { next(error); }
});
refundRouter.patch("/:refundId/approve", requireRole("ADMIN", "SUPER_ADMIN"), async (req, res, next) => {
  try {
    const params = z.object({ refundId: objectId }).parse(req.params);
    const refund = await Refund.findOne({ _id: params.refundId, hospital: req.auth!.hospitalId, status: "REQUESTED" });
    if (!refund) throw new AppError(404, "Pending refund not found", "REFUND_NOT_FOUND");
    const payment = await Payment.findById(refund.payment);
    if (!payment) throw new AppError(404, "Payment not found", "PAYMENT_NOT_FOUND");
    if (payment.method === "SSLCOMMERZ" && payment.bankTransactionId && sslCommerzConfigured()) {
      const result = await initiateSslCommerzRefund({ bankTransactionId: payment.bankTransactionId, refundId: transactionId("REF"), amount: refund.amount.toString(), reason: refund.reason });
      if (result.APIConnect !== "DONE" || !["success", "processing"].includes(result.status ?? "")) throw new AppError(502, result.errorReason || "Gateway refund failed", "REFUND_GATEWAY_FAILED");
      refund.gatewayReference = result.refund_ref_id ?? "";
      refund.status = result.status === "success" ? "PROCESSING" : "PROCESSING";
    } else {
      refund.status = "REFUNDED";
      const invoice = await Invoice.findById(payment.invoice);
      if (invoice) {
        invoice.paidAmount = mongoose.Types.Decimal128.fromString(Decimal.max(decimal(invoice.paidAmount).minus(refund.amount.toString()), 0).toFixed(2));
        invoice.dueAmount = mongoose.Types.Decimal128.fromString(decimal(invoice.dueAmount).plus(refund.amount.toString()).toFixed(2));
        invoice.status = "UNPAID";
        await invoice.save();
      }
      const previousRefunds = await Refund.find({
        payment: payment._id,
        _id: { $ne: refund._id },
        status: "REFUNDED"
      }).lean();
      const refundedTotal = previousRefunds.reduce((sum, item) => sum.plus(decimal(item.amount)), decimal(refund.amount));
      payment.status = refundedTotal.greaterThanOrEqualTo(decimal(payment.amount)) ? "REFUNDED" : "PARTIALLY_REFUNDED";
      await payment.save();
    }
    refund.approvedBy = req.auth!.userId;
    await refund.save();
    await writeAudit(req, "REFUND_APPROVED", "Refund", refund._id, refund.toObject());
    res.json({ data: refund });
  } catch (error) { next(error); }
});

export const reconciliationRouter = Router();
reconciliationRouter.use(requireAuth, requireRole("ADMIN", "SUPER_ADMIN"));
reconciliationRouter.get("/", async (req, res, next) => {
  try {
    const batches = await ReconciliationBatch.find({ hospital: req.auth!.hospitalId }).sort({ businessDate: -1 }).lean();
    res.json({ data: batches });
  } catch (error) { next(error); }
});
reconciliationRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({ businessDate: z.coerce.date(), externalReference: z.string().trim().min(2).max(160), expectedAmount: money, settledAmount: z.coerce.string().regex(/^\d+(\.\d{1,2})?$/), note: z.string().trim().max(500).default("") }).strict().parse(req.body);
    const variance = decimal(input.settledAmount).minus(input.expectedAmount);
    const batch = await ReconciliationBatch.create({ ...input, hospital: req.auth!.hospitalId, varianceAmount: variance.toFixed(2), status: variance.isZero() ? "MATCHED" : "VARIANCE", createdBy: req.auth!.userId });
    await writeAudit(req, "RECONCILIATION_CREATED", "ReconciliationBatch", batch._id, batch.toObject());
    res.status(201).json({ data: batch });
  } catch (error) { next(error); }
});
