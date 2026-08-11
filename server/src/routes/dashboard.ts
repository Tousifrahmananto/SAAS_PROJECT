import { Router } from "express";
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
    const hospital = req.auth!.hospitalId;
    const [patients, openEncounters, activeStaff, chargeSummary, invoiceSummary, paymentSummary, claimSummary, upcomingAppointments, unreadNotifications] = await Promise.all([
      Patient.countDocuments({ hospital }),
      Encounter.countDocuments({ hospital, status: "OPEN" }),
      User.countDocuments({ hospital, status: "ACTIVE" }),
      Charge.aggregate([
        { $match: { hospital, status: "POSTED" } },
        { $group: { _id: null, amount: { $sum: "$netAmount" }, count: { $sum: 1 } } }
      ]),
      Invoice.aggregate([
        { $match: { hospital, status: { $ne: "CANCELLED" } } },
        { $group: { _id: null, billed: { $sum: "$totalAmount" }, outstanding: { $sum: "$dueAmount" }, count: { $sum: 1 } } }
      ]),
      Payment.aggregate([
        { $match: { hospital, status: { $in: ["PAID", "PARTIALLY_REFUNDED"] } } },
        { $group: { _id: null, collected: { $sum: "$amount" }, count: { $sum: 1 } } }
      ]),
      Claim.aggregate([
        { $match: { hospital } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Appointment.countDocuments({ hospital, startsAt: { $gte: new Date() }, status: { $in: ["REQUESTED", "APPROVED"] } }),
      Notification.countDocuments({ hospital, readBy: { $ne: req.auth!.userId }, $or: [{ recipient: null }, { recipient: req.auth!.userId }] })
    ]);
    res.json({
      data: {
        patients,
        openEncounters,
        activeStaff,
        postedCharges: chargeSummary[0]?.count ?? 0,
        postedChargeAmount: chargeSummary[0]?.amount?.toString?.() ?? "0.00",
        invoices: invoiceSummary[0]?.count ?? 0,
        billed: invoiceSummary[0]?.billed?.toString?.() ?? "0.00",
        collected: paymentSummary[0]?.collected?.toString?.() ?? "0.00",
        outstanding: invoiceSummary[0]?.outstanding?.toString?.() ?? "0.00",
        claims: Object.fromEntries(claimSummary.map((item) => [item._id, item.count])),
        upcomingAppointments,
        unreadNotifications
      }
    });
  } catch (error) { next(error); }
});
