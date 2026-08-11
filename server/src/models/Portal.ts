import { Schema, model } from "mongoose";

const tenantFields = {
  hospital: { type: Schema.Types.ObjectId, ref: "Hospital", required: true, index: true }
};

const documentSchema = new Schema({
  ...tenantFields,
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: ["CONTRACT", "INVOICE", "REPORT", "IDENTIFICATION", "OTHER"], required: true, index: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, min: 1, max: 5_000_000 },
  data: { type: Buffer, required: true, select: false }
}, { timestamps: true });
documentSchema.index({ hospital: 1, createdAt: -1 });
export const DocumentAsset = model("DocumentAsset", documentSchema);

const appointmentSchema = new Schema({
  ...tenantFields,
  requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
  subject: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  startsAt: { type: Date, required: true, index: true },
  durationMinutes: { type: Number, min: 15, max: 480, default: 30 },
  status: { type: String, enum: ["REQUESTED", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"], default: "REQUESTED", index: true },
  decisionNote: { type: String, default: "" }
}, { timestamps: true });
appointmentSchema.index({ hospital: 1, startsAt: 1 });
export const Appointment = model("Appointment", appointmentSchema);

const messageSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true, trim: true, maxlength: 4000 },
  sentAt: { type: Date, default: Date.now }
}, { _id: true });
const conversationSchema = new Schema({
  ...tenantFields,
  subject: { type: String, required: true, trim: true },
  openedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN", index: true },
  messages: { type: [messageSchema], default: [] },
  lastMessageAt: { type: Date, default: Date.now }
}, { timestamps: true });
conversationSchema.index({ hospital: 1, lastMessageAt: -1 });
export const Conversation = model("Conversation", conversationSchema);

const notificationSchema = new Schema({
  ...tenantFields,
  recipient: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  type: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  link: { type: String, default: "" },
  readBy: [{ type: Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });
notificationSchema.index({ hospital: 1, recipient: 1, createdAt: -1 });
export const Notification = model("Notification", notificationSchema);

const contractSchema = new Schema({
  ...tenantFields,
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  version: { type: Number, default: 1, min: 1 },
  status: { type: String, enum: ["DRAFT", "PENDING", "ACCEPTED", "REJECTED"], default: "PENDING", index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  signedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  signerName: { type: String, default: "" },
  signatureDataUrl: { type: String, default: "", select: false },
  signedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: "" }
}, { timestamps: true });
contractSchema.index({ hospital: 1, createdAt: -1 });
export const Contract = model("Contract", contractSchema);

const invoiceItemSchema = new Schema({
  charge: { type: Schema.Types.ObjectId, ref: "Charge", default: null },
  description: { type: String, required: true, trim: true },
  quantity: { type: Schema.Types.Decimal128, required: true },
  unitPrice: { type: Schema.Types.Decimal128, required: true },
  discountAmount: { type: Schema.Types.Decimal128, default: "0.00" },
  vatAmount: { type: Schema.Types.Decimal128, default: "0.00" },
  lineTotal: { type: Schema.Types.Decimal128, required: true }
}, { _id: true });
const invoiceSchema = new Schema({
  ...tenantFields,
  invoiceNo: { type: String, required: true },
  title: { type: String, required: true, trim: true },
  items: { type: [invoiceItemSchema], validate: [(value: unknown[]) => value.length > 0, "At least one invoice item is required"] },
  status: { type: String, enum: ["DRAFT", "UNPAID", "PAID", "OVERDUE", "CANCELLED"], default: "DRAFT", index: true },
  subtotal: { type: Schema.Types.Decimal128, required: true },
  discountAmount: { type: Schema.Types.Decimal128, default: "0.00" },
  vatAmount: { type: Schema.Types.Decimal128, default: "0.00" },
  totalAmount: { type: Schema.Types.Decimal128, required: true },
  paidAmount: { type: Schema.Types.Decimal128, default: "0.00" },
  dueAmount: { type: Schema.Types.Decimal128, required: true },
  dueAt: { type: Date, required: true },
  issuedAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });
invoiceSchema.index({ hospital: 1, invoiceNo: 1 }, { unique: true });
invoiceSchema.index({ hospital: 1, dueAt: 1 });
export const Invoice = model("Invoice", invoiceSchema);

const paymentSchema = new Schema({
  ...tenantFields,
  invoice: { type: Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
  amount: { type: Schema.Types.Decimal128, required: true },
  method: { type: String, enum: ["CASH", "BANK", "SSLCOMMERZ", "BANGLA_QR", "SANDBOX"], required: true },
  status: { type: String, enum: ["INITIATED", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"], default: "INITIATED", index: true },
  transactionId: { type: String, required: true, unique: true },
  gatewaySession: { type: String, default: "" },
  bankTransactionId: { type: String, default: "" },
  validationId: { type: String, default: "" },
  receivedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  paidAt: { type: Date, default: null },
  failureReason: { type: String, default: "" }
}, { timestamps: true });
paymentSchema.index({ hospital: 1, createdAt: -1 });
export const Payment = model("Payment", paymentSchema);

const refundSchema = new Schema({
  ...tenantFields,
  payment: { type: Schema.Types.ObjectId, ref: "Payment", required: true, index: true },
  amount: { type: Schema.Types.Decimal128, required: true },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ["REQUESTED", "APPROVED", "PROCESSING", "REFUNDED", "REJECTED"], default: "REQUESTED" },
  requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  gatewayReference: { type: String, default: "" }
}, { timestamps: true });
export const Refund = model("Refund", refundSchema);

const reportSchema = new Schema({
  ...tenantFields,
  title: { type: String, required: true, trim: true },
  reportType: { type: String, enum: ["MONTHLY_BILLING", "FINANCIAL", "CLAIMS", "CUSTOM"], required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  summary: { type: String, default: "" },
  document: { type: Schema.Types.ObjectId, ref: "DocumentAsset", default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });
reportSchema.index({ hospital: 1, periodStart: -1 });
export const Report = model("Report", reportSchema);

const claimSchema = new Schema({
  ...tenantFields,
  claimNo: { type: String, required: true },
  patientName: { type: String, required: true, trim: true },
  payerName: { type: String, required: true, trim: true },
  amount: { type: Schema.Types.Decimal128, required: true },
  status: { type: String, enum: ["SUBMITTED", "PROCESSING", "APPROVED", "REJECTED", "PAID"], default: "SUBMITTED", index: true },
  rejectionReason: { type: String, default: "" },
  submittedAt: { type: Date, default: Date.now },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });
claimSchema.index({ hospital: 1, claimNo: 1 }, { unique: true });
export const Claim = model("Claim", claimSchema);

const reconciliationSchema = new Schema({
  ...tenantFields,
  businessDate: { type: Date, required: true },
  externalReference: { type: String, required: true, trim: true },
  expectedAmount: { type: Schema.Types.Decimal128, required: true },
  settledAmount: { type: Schema.Types.Decimal128, required: true },
  varianceAmount: { type: Schema.Types.Decimal128, required: true },
  status: { type: String, enum: ["OPEN", "MATCHED", "VARIANCE", "CLOSED"], required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  note: { type: String, default: "" }
}, { timestamps: true });
reconciliationSchema.index({ hospital: 1, businessDate: -1 });
export const ReconciliationBatch = model("ReconciliationBatch", reconciliationSchema);
