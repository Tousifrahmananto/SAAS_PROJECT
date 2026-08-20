import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { Charge } from "../models/Charge.js";
import { Encounter } from "../models/Encounter.js";
import { Patient } from "../models/Patient.js";
import { Appointment, Claim, Invoice, Notification, Payment } from "../models/Portal.js";
import { User } from "../models/User.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/", async (req, res, next) => {
  try {
    const query = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(req.query);
    const hospital = new Types.ObjectId(req.auth!.hospitalId);
    const now = new Date();
    const from = query.from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const to = query.to ?? now;
    if (to < from) return res.status(400).json({ error: { code: "INVALID_DATE_RANGE", message: "The end date must be after the start date" } });
    const dateRange = { $gte: from, $lte: to };
    const [patients, openEncounters, activeStaff, chargeSummary, invoiceSummary, invoiceStatuses, paymentSummary, claimSummary, upcomingAppointments, unreadNotifications, invoiceMonthly, paymentMonthly] = await Promise.all([
      Patient.countDocuments({ hospital }),
      Encounter.countDocuments({ hospital, status: "OPEN" }),
      User.countDocuments({ hospital, status: "ACTIVE" }),
      Charge.aggregate([{ $match: { hospital, status: "POSTED", postedAt: dateRange } }, { $group: { _id: null, amount: { $sum: "$netAmount" }, count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $match: { hospital, status: { $ne: "CANCELLED" }, createdAt: dateRange } }, { $group: { _id: null, billed: { $sum: "$totalAmount" }, outstanding: { $sum: "$dueAmount" }, count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $match: { hospital, createdAt: dateRange } }, { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$totalAmount" } } }]),
      Payment.aggregate([{ $match: { hospital, status: { $in: ["PAID", "PARTIALLY_REFUNDED"] }, paidAt: dateRange } }, { $group: { _id: null, collected: { $sum: "$amount" }, count: { $sum: 1 } } }]),
      Claim.aggregate([{ $match: { hospital, submittedAt: dateRange } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      Appointment.countDocuments({ hospital, startsAt: { $gte: now }, status: { $in: ["REQUESTED", "APPROVED"] } }),
      Notification.countDocuments({ hospital, readBy: { $ne: req.auth!.userId }, $or: [{ recipient: null }, { recipient: req.auth!.userId }] }),
      Invoice.aggregate([{ $match: { hospital, status: { $ne: "CANCELLED" }, createdAt: dateRange } }, { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: "Asia/Dhaka" } }, billed: { $sum: "$totalAmount" }, outstanding: { $sum: "$dueAmount" }, invoices: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Payment.aggregate([{ $match: { hospital, status: { $in: ["PAID", "PARTIALLY_REFUNDED"] }, paidAt: dateRange } }, { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$paidAt", timezone: "Asia/Dhaka" } }, collected: { $sum: "$amount" } } }, { $sort: { _id: 1 } }])
    ]);
    const paymentsByMonth = new Map(paymentMonthly.map((item) => [item._id, item.collected?.toString?.() ?? "0.00"]));
    const invoicesByMonth = new Map(invoiceMonthly.map((item) => [item._id, item]));
    const monthKeys = [...new Set([...invoicesByMonth.keys(), ...paymentsByMonth.keys()])].sort();
    res.json({ data: {
      period: { from, to }, patients, openEncounters, activeStaff,
      postedCharges: chargeSummary[0]?.count ?? 0,
      postedChargeAmount: chargeSummary[0]?.amount?.toString?.() ?? "0.00",
      invoices: invoiceSummary[0]?.count ?? 0,
      billed: invoiceSummary[0]?.billed?.toString?.() ?? "0.00",
      collected: paymentSummary[0]?.collected?.toString?.() ?? "0.00",
      outstanding: invoiceSummary[0]?.outstanding?.toString?.() ?? "0.00",
      claims: Object.fromEntries(claimSummary.map((item) => [item._id, item.count])),
      invoiceStatuses: invoiceStatuses.map((item) => ({ status: item._id, count: item.count, amount: item.amount?.toString?.() ?? "0.00" })),
      monthly: monthKeys.map((month) => ({ month, billed: invoicesByMonth.get(month)?.billed?.toString?.() ?? "0.00", collected: paymentsByMonth.get(month) ?? "0.00", outstanding: invoicesByMonth.get(month)?.outstanding?.toString?.() ?? "0.00", invoices: invoicesByMonth.get(month)?.invoices ?? 0 })),
      upcomingAppointments, unreadNotifications
    } });
  } catch (error) { next(error); }
});
