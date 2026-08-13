import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { Department } from "../models/Department.js";
import { Hospital } from "../models/Hospital.js";
import { Service } from "../models/Service.js";
import { User } from "../models/User.js";

if (process.env.NODE_ENV === "production") {
  throw new Error("The demo seed is disabled in production");
}

const demoPassword = process.env.DEMO_USER_PASSWORD;
if (!demoPassword || demoPassword.length < 12) {
  throw new Error("Set DEMO_USER_PASSWORD to at least 12 characters before seeding");
}

await connectDatabase();

const hospital = await Hospital.findOneAndUpdate(
  { code: "SHUROKKHA" },
  { name: "Shurokkha Hospital", district: "Dhaka", currencyCode: "BDT", timezone: "Asia/Dhaka", isActive: true },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

const departments = await Promise.all([
  ["ADMIN", "Administration", "ADMIN", false, false],
  ["OPD", "Outpatient Department", "CLINICAL", true, false],
  ["LAB", "Laboratory", "DIAGNOSTICS", true, false],
  ["CASH", "Main Cash Counter", "BILLING", false, true]
].map(([code, name, type, isChargeSource, isCashCounter]) => Department.findOneAndUpdate(
  { hospital: hospital._id, code },
  { name, type, isChargeSource, isCashCounter, isActive: true },
  { upsert: true, new: true, setDefaultsOnInsert: true }
)));

const [adminDepartment, opdDepartment, labDepartment] = departments;
const passwordHash = await bcrypt.hash(demoPassword, 12);
await User.findOneAndUpdate(
  { email: "admin@shurokkha.test" },
  {
    hospital: hospital._id,
    department: adminDepartment!._id,
    employeeNo: "ADM-001",
    fullName: "Demo Administrator",
    passwordHash,
    roles: ["SUPER_ADMIN"],
    permissions: ["patients:read", "patients:create", "encounters:create", "charges:create"],
    status: "ACTIVE"
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

await User.findOneAndUpdate(
  { email: "opd@shurokkha.test" },
  {
    hospital: hospital._id,
    department: opdDepartment!._id,
    employeeNo: "OPD-001",
    fullName: "Demo OPD Staff",
    passwordHash,
    roles: ["DEPARTMENT_STAFF"],
    permissions: ["catalog:read", "patients:read", "patients:create", "encounters:read", "encounters:create", "charges:read", "charges:create"],
    status: "ACTIVE"
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

await Promise.all([
  { department: opdDepartment!._id, code: "OPD-CONSULT", name: "General consultation", category: "OPD", price: "1200.00" },
  { department: opdDepartment!._id, code: "OPD-ECG", name: "ECG review", category: "OPD", price: "500.00" },
  { department: labDepartment!._id, code: "LAB-CBC", name: "Complete Blood Count", category: "LAB", price: "650.00" },
  { department: labDepartment!._id, code: "LAB-ESR", name: "ESR", category: "LAB", price: "350.00" }
].map((service) => Service.findOneAndUpdate(
  { hospital: hospital._id, code: service.code },
  { hospital: hospital._id, department: service.department, name: service.name, category: service.category, standardPrice: service.price, isActive: true },
  { upsert: true, new: true, setDefaultsOnInsert: true }
)));

console.log("Seed complete. Demo password was read securely from the environment.");
await mongoose.disconnect();
