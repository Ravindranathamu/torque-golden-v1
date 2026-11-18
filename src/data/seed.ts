import type {
  AdvancePayment,
  Appointment,
  AppNotification,
  AppState,
  AttendanceRecord,
  BankAccount,
  BankTransaction,
  CheckIn,
  CustomerCheque,
  CustomerCredit,
  CreditPayment,
  DamagePhoto,
  Expense,
  InsuranceClaim,
  InsuranceCompany,
  InventoryItem,
  JobCard,
  JobEstimate,
  JobPart,
  JobTask,
  LedgerEntry,
  MarketingReminder,
  Payslip,
  PettyCashEntry,
  ServiceRecord,
  StaffLoan,
  StockMovement,
  Supplier,
  SupplierCheque,
  SupplierCreditNote,
  OpenContainer,
  SupplierPurchase,
  SupplierReturn,
  VehicleBill,
  WagePayout,
  WorkshopLoan,
  WorkshopLoanPayment,
  WorkshopSection,
  WorkshopSettings,
  WorkshopUser,
  WorkerProfile,
} from "../types";
import { daysAgoISO, isoDaysFrom, jobTotals, taskWorkerIds, taskWorkers, uid } from "../lib/utils";
import { localDateKey, monthBounds } from "../lib/payroll";
import { allFeatureFlags } from "../lib/features";

export const STORAGE_KEY = "torque_workshop_erp_v1";

function svgPhoto(title: string, detail: string, accent = "#f97316"): DamagePhoto {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#263238"/><stop offset="1" stop-color="#101820"/>
    </linearGradient>
  </defs>
  <rect width="900" height="560" fill="url(#g)"/>
  <path d="M170 340h560c38 0 70-31 70-70v-30c0-22-11-43-30-56l-78-53c-22-15-48-23-75-23H340c-28 0-55 9-77 26l-70 53c-17 13-27 34-27 56v27c0 39 32 70 70 70z" fill="#5b6b73" opacity=".55"/>
  <circle cx="290" cy="345" r="52" fill="#111"/><circle cx="290" cy="345" r="22" fill="#899499"/>
  <circle cx="670" cy="345" r="52" fill="#111"/><circle cx="670" cy="345" r="22" fill="#899499"/>
  <path d="M300 230c45-55 82-76 150-76h155c38 0 62 18 88 44l30 32H300z" fill="#9fb1b9" opacity=".4"/>
  <ellipse cx="606" cy="286" rx="62" ry="20" fill="${accent}" opacity=".22"/>
  <path d="M560 265l54 18-34 20 44 14" stroke="${accent}" stroke-width="7" fill="none" stroke-linecap="round"/>
  <rect x="44" y="38" width="430" height="52" rx="10" fill="#000" opacity=".55"/>
  <text x="64" y="72" font-family="Segoe UI, Arial" font-size="25" fill="#fff">${title}</text>
  <text x="64" y="526" font-family="Segoe UI, Arial" font-size="18" fill="#c9d4d9">${detail}</text>
  <text x="760" y="526" font-family="Segoe UI, Arial" font-size="15" fill="#7d8f98">PRO inspection</text>
</svg>`;
  return {
    id: uid("photo"),
    name: title,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}

function logoDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" rx="52" fill="#0f766e"/>
  <circle cx="120" cy="120" r="78" fill="none" stroke="#fbbf24" stroke-width="7"/>
  <path d="M56 88l32 74 32-54 32 54 32-74" fill="none" stroke="#fff" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="120" y="210" text-anchor="middle" font-family="Segoe UI, Arial" font-size="18" fill="#d1fae5" letter-spacing="4">AUTOCARE</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const supplierIds = {
  hybrid: "sup_hybrid",
  partsHub: "sup_parts",
  lubricants: "sup_lube",
};

export const demoSectionIds = {
  mechanical: "sec_mechanical",
  electrical: "sec_electrical",
  body: "sec_body_paint",
  service: "sec_service_bay",
};

function makeSections(): WorkshopSection[] {
  return [
    {
      id: demoSectionIds.mechanical,
      name: "Mechanical",
      code: "MECH",
      description: "Engine, brakes, suspension and drivetrain repairs.",
      color: "#0f766e",
      supervisorIds: ["usr_supervisor"],
      storekeeperIds: ["usr_store", "usr_supervisor"],
      workerIds: ["wrk_kamal", "wrk_ruwan"],
      active: true,
      createdAt: daysAgoISO(1300),
    },
    {
      id: demoSectionIds.electrical,
      name: "Electrical & Hybrid",
      code: "ELEC",
      description: "Auto electrical, AC, hybrid battery and diagnostics.",
      color: "#2563eb",
      supervisorIds: ["usr_supervisor"],
      storekeeperIds: ["usr_store"],
      workerIds: ["wrk_nuwan"],
      active: true,
      createdAt: daysAgoISO(1300),
    },
    {
      id: demoSectionIds.body,
      name: "Body & Paint",
      code: "PAINT",
      description: "Tinker, panel beating, paint mixing and refinishing.",
      color: "#db2777",
      supervisorIds: ["usr_supervisor"],
      storekeeperIds: ["usr_store"],
      workerIds: ["wrk_chaminda"],
      active: true,
      createdAt: daysAgoISO(1300),
    },
    {
      id: demoSectionIds.service,
      name: "Service Bay",
      code: "SERV",
      description: "Periodic maintenance, quick service and final quality checks.",
      color: "#f59e0b",
      supervisorIds: ["usr_supervisor"],
      storekeeperIds: ["usr_store"],
      workerIds: ["wrk_sunil", "wrk_ruwan"],
      active: true,
      createdAt: daysAgoISO(1300),
    },
  ];
}

function sectionsForRepair(repairType: string): string[] {
  const text = repairType.toLowerCase();
  if (text.includes("body") || text.includes("paint") || text.includes("accident")) {
    return [demoSectionIds.body, demoSectionIds.service];
  }
  if (text.includes("ac") || text.includes("electrical") || text.includes("hybrid")) {
    return [demoSectionIds.electrical, demoSectionIds.service];
  }
  if (text.includes("service")) {
    return [demoSectionIds.service, demoSectionIds.mechanical];
  }
  return [demoSectionIds.mechanical, demoSectionIds.service];
}

function sectionForTask(name: string): string {
  const text = name.toLowerCase();
  if (text.includes("ac") || text.includes("electrical") || text.includes("diagnostic")) {
    return demoSectionIds.electrical;
  }
  if (text.includes("paint") || text.includes("body") || text.includes("panel")) {
    return demoSectionIds.body;
  }
  if (text.includes("service") || text.includes("oil")) {
    return demoSectionIds.service;
  }
  return demoSectionIds.mechanical;
}

function sectionForItem(name: string, type: string): string {
  const text = name.toLowerCase();
  if (type === "Consumable") {
    if (
      text.includes("paint") ||
      text.includes("cataloy") ||
      text.includes("putty") ||
      text.includes("thinner") ||
      text.includes("sandpaper") ||
      text.includes("primer") ||
      text.includes("clear coat")
    ) {
      return demoSectionIds.body;
    }
    if (text.includes("refrigerant") || text.includes("ac ")) {
      return demoSectionIds.electrical;
    }
    return demoSectionIds.mechanical;
  }
  if (text.includes("ac ") || text.includes("cabin")) return demoSectionIds.electrical;
  return demoSectionIds.mechanical;
}

function makeInventory(): InventoryItem[] {
  return [
    {
      id: "itm_brake_vezel",
      code: "HZ-VZ-BRK01",
      name: "Front Brake Pad Set",
      type: "Spare Part",
      make: "Honda",
      model: "Vezel",
      stock: 3,
      minStock: 2,
      unit: "set",
      lastSellingPrice: 7800,
      supplierId: supplierIds.hybrid,
    },
    {
      id: "itm_air_vezel",
      code: "HZ-VZ-AF02",
      name: "Air Filter",
      type: "Spare Part",
      make: "Honda",
      model: "Vezel",
      stock: 5,
      minStock: 2,
      unit: "pc",
      lastSellingPrice: 4500,
      supplierId: supplierIds.hybrid,
    },
    {
      id: "itm_cabin_vezel",
      code: "HZ-VZ-CF03",
      name: "Cabin Air Filter",
      type: "Spare Part",
      make: "Honda",
      model: "Vezel",
      stock: 2,
      minStock: 2,
      unit: "pc",
      lastSellingPrice: 3900,
      supplierId: supplierIds.hybrid,
    },
    {
      id: "itm_oilfilter_vezel",
      code: "HZ-VZ-OF04",
      name: "Engine Oil Filter",
      type: "Spare Part",
      make: "Honda",
      model: "Vezel",
      stock: 4,
      minStock: 2,
      unit: "pc",
      lastSellingPrice: 2800,
      supplierId: supplierIds.hybrid,
    },
    {
      id: "itm_air_aqua",
      code: "TH-AQ-AF11",
      name: "Air Filter",
      type: "Spare Part",
      make: "Toyota",
      model: "Aqua",
      stock: 2,
      minStock: 3,
      unit: "pc",
      lastSellingPrice: 4200,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_cabin_aqua",
      code: "TH-AQ-CF12",
      name: "Cabin Air Filter",
      type: "Spare Part",
      make: "Toyota",
      model: "Aqua",
      stock: 1,
      minStock: 2,
      unit: "pc",
      lastSellingPrice: 3900,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_brake_prius",
      code: "TH-PR-BRK13",
      name: "Brake Pad Set",
      type: "Spare Part",
      make: "Toyota",
      model: "Prius",
      stock: 1,
      minStock: 2,
      unit: "set",
      lastSellingPrice: 8500,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_acfilter_prius",
      code: "TH-PR-AC14",
      name: "AC Filter",
      type: "Spare Part",
      make: "Toyota",
      model: "Prius",
      stock: 2,
      minStock: 1,
      unit: "pc",
      lastSellingPrice: 4200,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_brake_leaf",
      code: "NS-LF-BRK15",
      name: "Brake Pad Set",
      type: "Spare Part",
      make: "Nissan",
      model: "Leaf",
      stock: 2,
      minStock: 2,
      unit: "set",
      lastSellingPrice: 11500,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_air_alto",
      code: "SZ-AL-AF16",
      name: "Air Filter",
      type: "Spare Part",
      make: "Suzuki",
      model: "Alto",
      stock: 0,
      minStock: 2,
      unit: "pc",
      lastSellingPrice: 3500,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_oilfilter_alto",
      code: "SZ-AL-OF17",
      name: "Engine Oil Filter",
      type: "Spare Part",
      make: "Suzuki",
      model: "Alto",
      stock: 3,
      minStock: 2,
      unit: "pc",
      lastSellingPrice: 2000,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_wiper",
      code: "UN-WP-24",
      name: 'Wiper Blade 24"',
      type: "Spare Part",
      stock: 8,
      minStock: 4,
      unit: "pc",
      lastSellingPrice: 3200,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_spark",
      code: "NGK-IR-6",
      name: "NGK Iridium Spark Plug",
      type: "Spare Part",
      stock: 12,
      minStock: 8,
      unit: "pc",
      lastSellingPrice: 1250,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_battery",
      code: "UN-BAT-55D",
      name: "Battery 55D23L",
      type: "Spare Part",
      stock: 2,
      minStock: 2,
      unit: "pc",
      lastSellingPrice: 28500,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_oil_5w40",
      code: "SH-5W40-4L",
      name: "Shell Helix Ultra 5W-40 (4L)",
      type: "Consumable",
      stock: 4,
      minStock: 3,
      unit: "bottle",
      lastSellingPrice: 12000,
      supplierId: supplierIds.lubricants,
    },
    {
      id: "itm_oil_10w30",
      code: "LK-10W30-4L",
      name: "Engine Oil 10W-30 (4L)",
      type: "Consumable",
      stock: 7,
      minStock: 4,
      unit: "bottle",
      lastSellingPrice: 9500,
      supplierId: supplierIds.lubricants,
    },
    {
      id: "itm_coolant",
      code: "TH-COOL-1L",
      name: "Toyota Genuine Coolant (1L)",
      type: "Consumable",
      stock: 2,
      minStock: 5,
      unit: "bottle",
      lastSellingPrice: 1800,
      supplierId: supplierIds.lubricants,
    },
    {
      id: "itm_brakefluid",
      code: "UN-DOT4-500",
      name: "Brake Fluid DOT4 (500ml)",
      type: "Consumable",
      stock: 6,
      minStock: 4,
      unit: "bottle",
      lastSellingPrice: 950,
      supplierId: supplierIds.lubricants,
    },
    {
      id: "itm_refrigerant",
      code: "UN-R134A-500",
      name: "AC Refrigerant R134a (500g)",
      type: "Consumable",
      stock: 8,
      minStock: 4,
      unit: "can",
      lastSellingPrice: 1200,
      supplierId: supplierIds.lubricants,
    },
    {
      id: "itm_carb_cleaner",
      code: "3M-CC-450",
      name: "Carb & Throttle Cleaner",
      type: "Consumable",
      stock: 2600,
      minStock: 900,
      unit: "ml",
      measureUnit: "ml",
      packSize: 450,
      packLabel: "450 ml spray can",
      lastSellingPrice: 4200,
      lastCostPrice: 2850,
      sharedConsumable: true,
      sectionId: demoSectionIds.mechanical,
      supplierId: supplierIds.lubricants,
    },
    {
      id: "itm_cataloy",
      code: "CTL-1KG",
      name: "Cataloy Body Filler",
      type: "Consumable",
      stock: 4200,
      minStock: 1000,
      unit: "g",
      measureUnit: "g",
      packSize: 1000,
      packLabel: "1 kg tin",
      lastSellingPrice: 8500,
      lastCostPrice: 5200,
      sharedConsumable: true,
      sectionId: demoSectionIds.body,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_2k_paint",
      code: "2K-WHT-1L",
      name: "2K Paint — Pearl White",
      type: "Consumable",
      stock: 3600,
      minStock: 1000,
      unit: "ml",
      measureUnit: "ml",
      packSize: 1000,
      packLabel: "1 L tin",
      lastSellingPrice: 24000,
      lastCostPrice: 16000,
      sharedConsumable: true,
      sectionId: demoSectionIds.body,
      supplierId: supplierIds.partsHub,
    },
    {
      id: "itm_thinner",
      code: "THN-1L",
      name: "2K Thinner",
      type: "Consumable",
      stock: 2800,
      minStock: 800,
      unit: "ml",
      measureUnit: "ml",
      packSize: 1000,
      packLabel: "1 L bottle",
      lastSellingPrice: 5200,
      lastCostPrice: 3100,
      sharedConsumable: true,
      sectionId: demoSectionIds.body,
      supplierId: supplierIds.lubricants,
    },
    {
      id: "itm_putty",
      code: "PUT-500G",
      name: "Polyester Putty",
      type: "Consumable",
      stock: 1800,
      minStock: 500,
      unit: "g",
      measureUnit: "g",
      packSize: 500,
      packLabel: "500 g tub",
      lastSellingPrice: 3800,
      lastCostPrice: 2100,
      sharedConsumable: true,
      sectionId: demoSectionIds.body,
      supplierId: supplierIds.partsHub,
    },
  ];
}

function makeWorkers(): WorkerProfile[] {
  return [
    {
      id: "wrk_kamal",
      fullName: "Kamal Bandara",
      phone: "+94 77 345 1122",
      nic: "198512304567",
      address: "45/2, Kundasale Road, Kandy",
      emergencyName: "Nadeesha Bandara",
      emergencyPhone: "+94 76 221 4455",
      baseSalary: 45000,
      commissionRate: 18,
      joined: daysAgoISO(820),
      status: "Active",
      bankName: "Commercial Bank",
      accountNumber: "0071234567",
      payType: "Monthly",
      dailyRate: 0,
      epfEnabled: true,
      etfEnabled: true,
      commissionEnabled: true,
      allowedOffDaysPerMonth: 2,
    },
    {
      id: "wrk_nuwan",
      fullName: "Nuwan Rathnayake",
      phone: "+94 71 882 5577",
      nic: "199023401234",
      address: "18, Ampitiya Road, Kandy",
      emergencyName: "Iresha Rathnayake",
      emergencyPhone: "+94 77 900 2211",
      baseSalary: 40000,
      commissionRate: 15,
      joined: daysAgoISO(540),
      status: "Active",
      bankName: "Sampath Bank",
      accountNumber: "1102556789",
      payType: "Monthly",
      dailyRate: 0,
      epfEnabled: true,
      etfEnabled: true,
      commissionEnabled: true,
      allowedOffDaysPerMonth: 2,
    },
    {
      id: "wrk_sunil",
      fullName: "Sunil Herath",
      phone: "+94 75 441 8899",
      nic: "199430002211",
      address: "7, Gampola Lane, Kandy",
      emergencyName: "Chamari Herath",
      emergencyPhone: "+94 70 112 3344",
      baseSalary: 30000,
      commissionRate: 10,
      joined: daysAgoISO(310),
      status: "Active",
      bankName: "People's Bank",
      accountNumber: "0823344551",
      payType: "Monthly",
      dailyRate: 0,
      epfEnabled: true,
      etfEnabled: true,
      commissionEnabled: true,
      allowedOffDaysPerMonth: 2,
    },
    {
      id: "wrk_ruwan",
      fullName: "Ruwan Fernando",
      phone: "+94 70 771 2233",
      nic: "198710112233",
      address: "112, Peradeniya Road, Kandy",
      emergencyName: "Dilani Fernando",
      emergencyPhone: "+94 77 660 7788",
      baseSalary: 55000,
      commissionRate: 12,
      joined: daysAgoISO(1200),
      status: "Active",
      bankName: "Hatton National Bank",
      accountNumber: "0031556699",
      userId: "usr_supervisor",
      payType: "Monthly",
      dailyRate: 0,
      epfEnabled: true,
      etfEnabled: true,
      commissionEnabled: true,
      allowedOffDaysPerMonth: 3,
    },
    {
      id: "wrk_chaminda",
      fullName: "Chaminda Silva",
      phone: "+94 72 118 4466",
      nic: "199845607788",
      address: "23, Lewella Road, Kandy",
      emergencyName: "Sujani Silva",
      emergencyPhone: "+94 71 907 2255",
      baseSalary: 0,
      commissionRate: 8,
      joined: daysAgoISO(95),
      status: "Active",
      bankName: "Commercial Bank",
      accountNumber: "0079988123",
      payType: "Daily",
      dailyRate: 4500,
      epfEnabled: false,
      etfEnabled: false,
      commissionEnabled: true,
      allowedOffDaysPerMonth: 1,
    },
  ];
}

function makeUsers(): WorkshopUser[] {
  return [
    {
      id: "usr_owner",
      name: "Nimal Perera",
      username: "owner",
      pin: "1234",
      isOwner: true,
      departments: [],
      phone: "+94 77 000 1000",
      email: "owner@vezelmasters.lk",
      baseSalary: 0,
      commissionRate: 0,
      active: true,
      createdAt: daysAgoISO(1300),
    },
    {
      id: "usr_pro",
      name: "Kasun Silva",
      username: "kasun",
      pin: "1234",
      isOwner: false,
      departments: ["PRO"],
      phone: "+94 76 113 5544",
      email: "kasun@vezelmasters.lk",
      baseSalary: 50000,
      commissionRate: 0,
      gdriveEmail: "vezel.pro@autocare.lk",
      active: true,
      createdAt: daysAgoISO(900),
    },
    {
      id: "usr_supervisor",
      name: "Ruwan Fernando",
      username: "ruwan",
      pin: "1234",
      isOwner: false,
      departments: ["Supervisor", "Stores"],
      phone: "+94 70 771 2233",
      email: "ruwan@vezelmasters.lk",
      baseSalary: 55000,
      commissionRate: 12,
      gdriveEmail: "vezel.workshop@autocare.lk",
      workerId: "wrk_ruwan",
      active: true,
      createdAt: daysAgoISO(1200),
    },
    {
      id: "usr_store",
      name: "Sampath Weerasinghe",
      username: "sampath",
      pin: "1234",
      isOwner: false,
      departments: ["Stores"],
      phone: "+94 71 445 6677",
      email: "stores@vezelmasters.lk",
      baseSalary: 50000,
      commissionRate: 0,
      gdriveEmail: "vezel.stores@autocare.lk",
      active: true,
      createdAt: daysAgoISO(700),
    },
    {
      id: "usr_cashier",
      name: "Ishara Jayasuriya",
      username: "ishara",
      pin: "1234",
      isOwner: false,
      departments: ["Cashier"],
      phone: "+94 77 889 1122",
      email: "cashier@vezelmasters.lk",
      baseSalary: 50000,
      commissionRate: 0,
      active: true,
      createdAt: daysAgoISO(650),
    },
    {
      id: "usr_accounts",
      name: "Malini Abeywickrama",
      username: "malini",
      pin: "1234",
      isOwner: false,
      departments: ["Accounting"],
      phone: "+94 76 234 9900",
      email: "accounts@vezelmasters.lk",
      baseSalary: 60000,
      commissionRate: 0,
      gdriveEmail: "vezel.accounts@autocare.lk",
      active: true,
      createdAt: daysAgoISO(880),
    },
  ];
}

function makeCheckIns(): CheckIn[] {
  return [
    {
      id: "CI-2041",
      createdAt: daysAgoISO(0, 8),
      vehicleNo: "WP CAV-8742",
      make: "Honda",
      model: "Vezel",
      customerName: "A. Perera",
      phone: "+94 77 123 4567",
      mileage: 48530,
      email: "aperera@gmail.com",
      address: "22, Wattegama Road, Kandy",
      status: "Awaiting Approval",
    },
    {
      id: "CI-2042",
      createdAt: daysAgoISO(0, 9),
      vehicleNo: "WP CBB-2290",
      make: "Toyota",
      model: "Aqua",
      customerName: "S. Fernando",
      phone: "+94 71 555 7890",
      mileage: 32180,
      email: "sfernando@yahoo.com",
      address: "8, Katugastota Road, Kandy",
      status: "Awaiting Approval",
    },
    {
      id: "CI-2043",
      createdAt: daysAgoISO(0, 7),
      vehicleNo: "CP LK-1188",
      make: "Nissan",
      model: "Leaf",
      customerName: "D. Wickramasinghe",
      phone: "+94 77 908 4433",
      mileage: 41200,
      address: "Kandy",
      status: "Awaiting Approval",
    },
  ];
}

function makeJobCards(): JobCard[] {
  return [
    {
      id: "JC-1001",
      numericId: 1001,
      checkInId: "CI-2038",
      createdAt: daysAgoISO(0, 8),
      acceptedAt: daysAgoISO(0, 8),
      vehicleNo: "WP CAV-8742",
      make: "Honda",
      model: "Vezel",
      customerName: "A. Perera",
      phone: "+94 77 123 4567",
      customerAddress: "22, Wattegama Road, Kandy",
      mileage: 48530,
      repairType: "Brake System",
      intakeType: "Repair",
      safetyNotes:
        "Front bumper has a deep scratch on the left corner. Small dent on the left rear door (pre-existing). Front brake pads worn below 2mm; customer reports squealing under braking.",
      photos: [
        svgPhoto("Front bumper scratch", "Left corner · documented at gate", "#f97316"),
        svgPhoto("Left rear door dent", "Pre-existing dent · documented at gate", "#ef4444"),
      ],
      driveFolderId: "gdrive://Workshop_Job_Cards/Job_Card_1001",
      status: "In Progress",
      discount: 0,
      discountType: "Fixed",
      driver: {
        name: "Sunil Perera",
        phone: "+94 71 234 5678",
        basis: "Labour",
        type: "Percentage",
        value: 10,
      },
    },
    {
      id: "JC-1002",
      numericId: 1002,
      checkInId: "CI-2039",
      createdAt: daysAgoISO(1, 9),
      acceptedAt: daysAgoISO(1, 9),
      completedAt: daysAgoISO(0, 10),
      vehicleNo: "WP CAB-5521",
      make: "Toyota",
      model: "Prius",
      customerName: "N. Silva",
      phone: "+94 76 221 9080",
      customerAddress: "14/1, Rajapihilla Mawatha, Kandy",
      mileage: 59720,
      repairType: "AC Repair",
      intakeType: "Repair",
      safetyNotes:
        "AC blows warm at idle. Customer approved compressor diagnostic. No visible body damage at intake.",
      photos: [svgPhoto("AC vent temperature", "Warm air at idle · 31°C", "#38bdf8")],
      driveFolderId: "gdrive://Workshop_Job_Cards/Job_Card_1002",
      status: "Repair Completed",
      discount: 0,
      discountType: "Fixed",
    },
    {
      id: "JC-1003",
      numericId: 1003,
      checkInId: "CI-2037",
      createdAt: daysAgoISO(0, 7),
      acceptedAt: daysAgoISO(0, 7),
      completedAt: daysAgoISO(0, 9),
      paidAt: daysAgoISO(0, 10),
      vehicleNo: "WP CBA-7733",
      make: "Suzuki",
      model: "Alto",
      customerName: "R. Jayasinghe",
      phone: "+94 71 334 2211",
      customerAddress: "36, William Gopallawa Mawatha, Kandy",
      mileage: 38750,
      repairType: "Periodic Service",
      intakeType: "Repair",
      safetyNotes: "Minor stone chips on the bonnet. No other pre-existing damage noted.",
      photos: [svgPhoto("Bonnet stone chips", "Pre-existing · documented at gate", "#eab308")],
      driveFolderId: "gdrive://Workshop_Job_Cards/Job_Card_1003",
      status: "Paid",
      paymentMethod: "Cash",
      discount: 500,
      discountType: "Fixed",
    },
    {
      id: "JC-1004",
      numericId: 1004,
      checkInId: "CI-2036",
      createdAt: daysAgoISO(2, 9),
      acceptedAt: daysAgoISO(2, 9),
      dispatchedAt: daysAgoISO(2, 12),
      vehicleNo: "WP CAD-1188",
      make: "Toyota",
      model: "Aqua",
      customerName: "M. Gunasekara",
      phone: "+94 77 655 9011",
      customerAddress: "59, Anagarika Dharmapala Mawatha, Kandy",
      mileage: 48900,
      repairType: "Periodic Service",
      intakeType: "Repair",
      safetyNotes: "No pre-existing damage recorded.",
      photos: [],
      driveFolderId: "gdrive://Workshop_Job_Cards/Job_Card_1004",
      status: "Dispatched",
      paymentMethod: "Card",
      discount: 0,
      discountType: "Fixed",
    },
    {
      id: "JC-0998",
      numericId: 998,
      checkInId: "CI-2011",
      createdAt: daysAgoISO(58, 9),
      acceptedAt: daysAgoISO(58, 9),
      completedAt: daysAgoISO(58, 11),
      paidAt: daysAgoISO(58, 12),
      dispatchedAt: daysAgoISO(58, 13),
      vehicleNo: "WP CAV-8742",
      make: "Honda",
      model: "Vezel",
      customerName: "A. Perera",
      phone: "+94 77 123 4567",
      mileage: 45100,
      repairType: "Periodic Service",
      intakeType: "Repair",
      safetyNotes: "Routine periodic maintenance. No new damage.",
      photos: [],
      driveFolderId: "gdrive://Workshop_Job_Cards/Job_Card_0998",
      status: "Dispatched",
      paymentMethod: "Cash",
      discount: 0,
      discountType: "Fixed",
    },
    {
      id: "JC-0961",
      numericId: 961,
      checkInId: "CI-1960",
      createdAt: daysAgoISO(116, 9),
      acceptedAt: daysAgoISO(116, 9),
      completedAt: daysAgoISO(116, 11),
      paidAt: daysAgoISO(116, 12),
      dispatchedAt: daysAgoISO(116, 13),
      vehicleNo: "WP CAV-8742",
      make: "Honda",
      model: "Vezel",
      customerName: "A. Perera",
      phone: "+94 77 123 4567",
      mileage: 41200,
      repairType: "Periodic Service",
      intakeType: "Repair",
      safetyNotes: "First recorded periodic service at this workshop.",
      photos: [],
      driveFolderId: "gdrive://Workshop_Job_Cards/Job_Card_0961",
      status: "Dispatched",
      paymentMethod: "Cash",
      discount: 0,
      discountType: "Fixed",
    },
    {
      id: "JC-0985",
      numericId: 985,
      checkInId: "CI-1998",
      createdAt: daysAgoISO(30, 9),
      acceptedAt: daysAgoISO(30, 9),
      completedAt: daysAgoISO(30, 11),
      paidAt: daysAgoISO(30, 12),
      dispatchedAt: daysAgoISO(30, 13),
      vehicleNo: "WP CBB-2290",
      make: "Toyota",
      model: "Aqua",
      customerName: "S. Fernando",
      phone: "+94 71 555 7890",
      mileage: 31500,
      repairType: "AC Repair",
      intakeType: "Repair",
      safetyNotes: "AC cooling weak. Cabin filter heavily soiled.",
      photos: [],
      driveFolderId: "gdrive://Workshop_Job_Cards/Job_Card_0985",
      status: "Dispatched",
      paymentMethod: "Cash",
      discount: 0,
      discountType: "Fixed",
    },
    {
      id: "JC-1005",
      numericId: 1005,
      checkInId: "CI-2035",
      createdAt: daysAgoISO(3, 9),
      acceptedAt: daysAgoISO(3, 9),
      vehicleNo: "WP CAJ-4410",
      make: "Toyota",
      model: "Vezel",
      customerName: "R. Bandara",
      phone: "+94 77 512 8899",
      customerAddress: "18/3, Sangaraja Mawatha, Kandy",
      mileage: 35200,
      repairType: "Accident Repair",
      intakeType: "Repair",
      safetyNotes:
        "Front-end collision damage. Insurer assessor inspected on site. Front bumper and left headlamp approved for replacement; salvage parts must be handed to the insurer.",
      photos: [
        svgPhoto("Front bumper damage", "Collision damage documented with assessor", "#f97316"),
        svgPhoto("Left headlamp damage", "Cracked lens and mounting tab", "#ef4444"),
      ],
      driveFolderId: "gdrive://Workshop_Job_Cards/Job_Card_1005",
      status: "In Progress",
      discount: 0,
      discountType: "Fixed",
      insuranceClaimId: "clm_1",
    },
  ];
}

function makeTasks(): JobTask[] {
  const tasks: JobTask[] = [
    {
      id: "tsk_1",
      jobCardId: "JC-1001",
      name: "Front brake pad replacement",
      laborCost: 3500,
      workerId: "wrk_kamal",
      createdAt: daysAgoISO(0, 9),
    },
    {
      id: "tsk_2",
      jobCardId: "JC-1001",
      name: "Brake fluid flush & bleed",
      laborCost: 1500,
      workerId: "wrk_nuwan",
      createdAt: daysAgoISO(0, 10),
    },
    {
      id: "tsk_3",
      jobCardId: "JC-1002",
      name: "AC compressor diagnostic",
      laborCost: 3000,
      workerId: "wrk_nuwan",
      createdAt: daysAgoISO(1, 10),
    },
    {
      id: "tsk_4",
      jobCardId: "JC-1002",
      name: "AC gas refill & leak test",
      laborCost: 4500,
      workerId: "wrk_kamal",
      createdAt: daysAgoISO(0, 9),
    },
    {
      id: "tsk_5",
      jobCardId: "JC-1003",
      name: "Full service & oil change",
      laborCost: 4000,
      workerId: "wrk_sunil",
      createdAt: daysAgoISO(0, 8),
    },
    {
      id: "tsk_6",
      jobCardId: "JC-1004",
      name: "Periodic maintenance service",
      laborCost: 5500,
      workerId: "wrk_kamal",
      createdAt: daysAgoISO(2, 10),
    },
    {
      id: "tsk_7",
      jobCardId: "JC-0998",
      name: "Periodic maintenance service",
      laborCost: 4500,
      workerId: "wrk_nuwan",
      createdAt: daysAgoISO(58, 10),
    },
    {
      id: "tsk_8",
      jobCardId: "JC-0961",
      name: "Periodic maintenance service",
      laborCost: 4500,
      workerId: "wrk_kamal",
      createdAt: daysAgoISO(116, 10),
    },
    {
      id: "tsk_9",
      jobCardId: "JC-0985",
      name: "AC gas refill",
      laborCost: 4500,
      workerId: "wrk_sunil",
      createdAt: daysAgoISO(30, 10),
    },
    {
      id: "tsk_10",
      jobCardId: "JC-0985",
      name: "AC leak test",
      laborCost: 4000,
      workerId: "wrk_nuwan",
      createdAt: daysAgoISO(30, 10),
    },
    {
      id: "tsk_11",
      jobCardId: "JC-1005",
      name: "Bumper removal and refit",
      laborCost: 3000,
      quotedLaborCost: 3500,
      workerId: "wrk_kamal",
      assignedBillId: "bill_1",
      estimateId: "est_1005_initial",
      estimateLineId: "el_1",
      createdAt: daysAgoISO(3, 10),
    },
    {
      id: "tsk_12",
      jobCardId: "JC-1005",
      name: "Headlamp replacement",
      laborCost: 1800,
      workerId: "wrk_sunil",
      assignedBillId: "bill_1",
      estimateId: "est_1005_initial",
      estimateLineId: "el_2",
      createdAt: daysAgoISO(3, 10),
    },
    {
      id: "tsk_13",
      jobCardId: "JC-1005",
      name: "Panel alignment and gap setting",
      laborCost: 2200,
      quotedLaborCost: 2500,
      workerId: "wrk_kamal",
      assignedBillId: "bill_1",
      estimateId: "est_1005_initial",
      estimateLineId: "el_3",
      createdAt: daysAgoISO(3, 11),
    },
    {
      id: "tsk_14",
      jobCardId: "JC-1005",
      name: "Courtesy wash and interior vacuum",
      laborCost: 2500,
      workerId: "wrk_nuwan",
      isCustomerExtra: true,
      assignedBillId: "bill_2",
      createdAt: daysAgoISO(2, 15),
    },
  ];
  return tasks.map((task) => ({
    ...task,
    workerIds: taskWorkerIds(task),
  }));
}

function part(
  id: string,
  jobCardId: string,
  itemId: string,
  itemName: string,
  qty: number,
  costPrice: number,
  marginPercent: number,
  sellingPrice: number,
  supplierId: string,
  daysAgo: number,
): JobPart {
  const prefix =
    supplierId === supplierIds.hybrid
      ? "HZL"
      : supplierId === supplierIds.partsHub
        ? "APH"
        : "LL";
  return {
    id,
    jobCardId,
    itemId,
    itemName,
    qtyRequested: qty,
    qtyIssued: qty,
    costPrice,
    marginPercent,
    sellingPrice,
    status: "Issued",
    supplierId,
    supplierInvoiceNo: `${prefix}/26/${String(1841 + daysAgo).padStart(4, "0")}`,
    warrantyStatus: "None",
    salvageStatus: jobCardId === "JC-1005" ? "Pending" : "Not Required",
    createdAt: daysAgoISO(daysAgo, 10),
    updatedAt: daysAgoISO(daysAgo, 11),
  };
}

function fractionalPart(
  id: string,
  jobCardId: string,
  itemId: string,
  itemName: string,
  qty: number,
  costPerUnit: number,
  sellingPerUnit: number,
  includedInLabor: boolean,
  daysAgo: number,
  sectionId: string,
): JobPart {
  return {
    id,
    jobCardId,
    itemId,
    itemName,
    qtyRequested: qty,
    qtyIssued: qty,
    costPrice: costPerUnit,
    marginPercent:
      costPerUnit > 0 ? ((sellingPerUnit - costPerUnit) / costPerUnit) * 100 : 0,
    sellingPrice: sellingPerUnit,
    status: "Issued",
    sectionId,
    includedInLabor,
    measuredQty: true,
    supplierId: supplierIds.lubricants,
    supplierInvoiceNo: "SHOP-FLOOR",
    warrantyStatus: "None",
    salvageStatus: "Not Required",
    createdAt: daysAgoISO(daysAgo, 11),
    updatedAt: daysAgoISO(daysAgo, 12),
  };
}

function makeParts(): JobPart[] {
  const rows: JobPart[] = [
    part("jp_1", "JC-1001", "itm_brake_vezel", "Front Brake Pad Set", 1, 6500, 20, 7800, supplierIds.hybrid, 0),
    part("jp_2", "JC-1001", "itm_brakefluid", "Brake Fluid DOT4 (500ml)", 1, 700, 35.71, 950, supplierIds.lubricants, 0),
    part("jp_3", "JC-1002", "itm_acfilter_prius", "AC Filter", 1, 2800, 50, 4200, supplierIds.partsHub, 1),
    part("jp_4", "JC-1002", "itm_refrigerant", "AC Refrigerant R134a (500g)", 3, 800, 50, 1200, supplierIds.lubricants, 1),
    part("jp_5", "JC-1003", "itm_oil_10w30", "Engine Oil 10W-30 (4L)", 1, 6800, 39.71, 9500, supplierIds.lubricants, 0),
    part("jp_6", "JC-1003", "itm_air_alto", "Air Filter", 1, 2400, 45.83, 3500, supplierIds.partsHub, 0),
    part("jp_7", "JC-1003", "itm_oilfilter_alto", "Engine Oil Filter", 1, 1200, 66.67, 2000, supplierIds.partsHub, 0),
    part("jp_8", "JC-1004", "itm_air_aqua", "Air Filter", 1, 2900, 44.83, 4200, supplierIds.partsHub, 2),
    part("jp_9", "JC-1004", "itm_oil_5w40", "Shell Helix Ultra 5W-40 (4L)", 1, 8600, 39.53, 12000, supplierIds.lubricants, 2),
    part("jp_10", "JC-0998", "itm_air_vezel", "Air Filter", 1, 3000, 50, 4500, supplierIds.hybrid, 58),
    part("jp_11", "JC-0998", "itm_oil_5w40", "Shell Helix Ultra 5W-40 (4L)", 1, 8600, 39.53, 12000, supplierIds.lubricants, 58),
    part("jp_12", "JC-0998", "itm_cabin_vezel", "Cabin Air Filter", 1, 2500, 56, 3900, supplierIds.hybrid, 58),
    part("jp_13", "JC-0961", "itm_air_vezel", "Air Filter", 1, 3000, 50, 4500, supplierIds.hybrid, 116),
    part("jp_14", "JC-0961", "itm_oil_5w40", "Shell Helix Ultra 5W-40 (4L)", 1, 8600, 39.53, 12000, supplierIds.lubricants, 116),
    part("jp_15", "JC-0961", "itm_oilfilter_vezel", "Engine Oil Filter", 1, 1800, 55.56, 2800, supplierIds.hybrid, 116),
    part("jp_16", "JC-0985", "itm_refrigerant", "AC Refrigerant R134a (500g)", 3, 800, 50, 1200, supplierIds.lubricants, 30),
    part("jp_17", "JC-0985", "itm_cabin_aqua", "Cabin Air Filter", 1, 2600, 50, 3900, supplierIds.partsHub, 30),
    part("jp_18", "JC-1005", "itm_bumper_vezel", "Front Bumper Assembly", 1, 42000, 15, 48300, supplierIds.hybrid, 3),
    part("jp_19", "JC-1005", "itm_headlamp_vezel", "Headlamp Assembly — Left", 1, 28500, 18, 33630, supplierIds.hybrid, 3),
    fractionalPart("jp_20", "JC-1001", "itm_carb_cleaner", "Carb & Throttle Cleaner", 250, 2850 / 450, 4200 / 450, true, 0, demoSectionIds.mechanical),
    fractionalPart("jp_21", "JC-1005", "itm_cataloy", "Cataloy Body Filler", 300, 5200 / 1000, 8500 / 1000, false, 3, demoSectionIds.body),
    fractionalPart("jp_22", "JC-1005", "itm_2k_paint", "2K Paint — Pearl White", 350, 16000 / 1000, 24000 / 1000, false, 3, demoSectionIds.body),
  ];
  return rows.map((entry) => {
    if (entry.id === "jp_17") {
      return {
        ...entry,
        warrantyStatus: "Credited",
        warrantyReplacementInvoiceNo: "APH/26/1905",
        warrantyNote: "Defective cabin filter replaced under supplier warranty.",
        creditNoteNo: "SCN-7001",
        creditNoteAmount: 3900,
      };
    }
    if (entry.id === "jp_18") {
      return {
        ...entry,
        sellingPrice: 45500,
        quotedSellingPrice: 48300,
        insuranceApprovedPrice: 45500,
        assignedBillId: "bill_1",
        estimateId: "est_1005_initial",
        estimateLineId: "el_4",
      };
    }
    if (entry.id === "jp_19") {
      return {
        ...entry,
        insuranceApprovedPrice: 33630,
        assignedBillId: "bill_1",
        estimateId: "est_1005_initial",
        estimateLineId: "el_5",
      };
    }
    if (entry.id === "jp_21" || entry.id === "jp_22") {
      return { ...entry, assignedBillId: "bill_2" };
    }
    return entry;
  });
}

function makeSuppliers(): Supplier[] {
  return [
    {
      id: supplierIds.hybrid,
      name: "Hybrid Zone Lanka",
      phone: "+94 77 222 3344",
      contactPerson: "Ashan",
      outstandingCredit: 84500,
    },
    {
      id: supplierIds.partsHub,
      name: "Auto Parts Hub",
      phone: "+94 11 234 5678",
      contactPerson: "Fazil",
      outstandingCredit: 0,
    },
    {
      id: supplierIds.lubricants,
      name: "Lanka Lubricants",
      phone: "+94 76 555 1122",
      contactPerson: "Dinesh",
      outstandingCredit: 32000,
    },
  ];
}

function makePurchases(): SupplierPurchase[] {
  return [
    {
      id: "PO-8841",
      supplierId: supplierIds.hybrid,
      invoiceNo: "HZL/26/1841",
      amount: 84500,
      type: "Credit",
      creditDays: 30,
      purchaseDate: daysAgoISO(28),
      dueDate: isoDaysFrom(new Date(), 2),
      status: "Unpaid",
      description: "Vezel brake pads, air filters & cabin filters",
      lines: [
        { id: "pl_1", itemId: "itm_brake_vezel", itemName: "Front Brake Pad Set", qty: 8, costPrice: 6500, sellingPrice: 7800 },
        { id: "pl_2", itemId: "itm_air_vezel", itemName: "Air Filter", qty: 5, costPrice: 3500, sellingPrice: 4500 },
        { id: "pl_3", itemId: "itm_cabin_vezel", itemName: "Cabin Air Filter", qty: 5, costPrice: 3000, sellingPrice: 3900 },
      ],
      goodsConfirmedBy: "Sampath Weerasinghe",
      goodsConfirmedAt: daysAgoISO(28, 11),
      chequeId: "schq_1",
    },
    {
      id: "PO-8842",
      supplierId: supplierIds.lubricants,
      invoiceNo: "LL/26/772",
      amount: 32000,
      type: "Credit",
      creditDays: 21,
      purchaseDate: daysAgoISO(16),
      dueDate: isoDaysFrom(new Date(), 5),
      status: "Unpaid",
      description: "Engine oil, coolant & brake fluid restock",
      lines: [
        { id: "pl_4", itemId: "itm_oil_10w30", itemName: "Engine Oil 10W-30 (4L)", qty: 2, costPrice: 6800, sellingPrice: 9500 },
        { id: "pl_5", itemId: "itm_oil_5w40", itemName: "Shell Helix Ultra 5W-40 (4L)", qty: 2, costPrice: 8600, sellingPrice: 12000 },
        { id: "pl_6", itemId: "itm_coolant", itemName: "Toyota Genuine Coolant (1L)", qty: 1, costPrice: 1200, sellingPrice: 1800 },
      ],
      goodsConfirmedBy: "Sampath Weerasinghe",
      goodsConfirmedAt: daysAgoISO(16, 10),
    },
    {
      id: "PO-8830",
      supplierId: supplierIds.partsHub,
      invoiceNo: "APH/26/903",
      amount: 45500,
      type: "Cash",
      creditDays: 0,
      purchaseDate: daysAgoISO(9),
      status: "Paid",
      description: "Spark plugs, wipers & batteries",
      lines: [
        { id: "pl_7", itemId: "itm_spark", itemName: "NGK Iridium Spark Plug", qty: 8, costPrice: 1250, sellingPrice: 1250 },
        { id: "pl_8", itemId: "itm_wiper", itemName: 'Wiper Blade 24"', qty: 8, costPrice: 3200, sellingPrice: 3200 },
        { id: "pl_9", itemId: "itm_battery", itemName: "Battery 55D23L", qty: 1, costPrice: 9900, sellingPrice: 28500 },
      ],
      goodsConfirmedBy: "Sampath Weerasinghe",
      goodsConfirmedAt: daysAgoISO(9, 11),
      paidBy: "Malini Abeywickrama",
      paidAt: daysAgoISO(9, 15),
      paymentMethod: "Cash",
    },
  ];
}

function makeExpenses(): Expense[] {
  return [
    {
      id: "exp_1",
      date: daysAgoISO(11),
      category: "Rental",
      amount: 45000,
      description: "Workshop premises monthly rent",
    },
    {
      id: "exp_2",
      date: daysAgoISO(7),
      category: "Electricity",
      amount: 14500,
      description: "CEB bill — workshop & compressor",
    },
    {
      id: "exp_3",
      date: daysAgoISO(5),
      category: "Water",
      amount: 3500,
      description: "NWSDB water bill",
    },
    {
      id: "exp_4",
      date: daysAgoISO(4),
      category: "Operational Cost",
      amount: 9500,
      description: "Cleaning agents, shop towels, printer rolls",
    },
    {
      id: "exp_5",
      date: daysAgoISO(2),
      category: "Other Expenses",
      amount: 6500,
      description: "Internet, telephone & Google Workspace",
    },
  ];
}

function ledgerEntry(
  id: string,
  daysAgo: number,
  labor: number,
  partsRev: number,
  partsCost: number,
  commission: number,
  method: LedgerEntry["paymentMethod"],
  description: string,
  discount = 0,
  workerId?: string,
): LedgerEntry {
  const primaryId = sectionForTask(description);
  const secondaryId =
    primaryId === demoSectionIds.service
      ? demoSectionIds.mechanical
      : demoSectionIds.service;
  const split = 0.7;
  const primary = {
    sectionId: primaryId,
    sectionName:
      primaryId === demoSectionIds.mechanical
        ? "Mechanical"
        : primaryId === demoSectionIds.electrical
          ? "Electrical & Hybrid"
          : primaryId === demoSectionIds.body
            ? "Body & Paint"
            : "Service Bay",
    laborRevenue: Math.round(labor * split * 100) / 100,
    partsRevenue: Math.round(partsRev * split * 100) / 100,
    partsCost: Math.round(partsCost * split * 100) / 100,
    commission: Math.round(commission * split * 100) / 100,
  };
  const secondary = {
    sectionId: secondaryId,
    sectionName:
      secondaryId === demoSectionIds.mechanical ? "Mechanical" : "Service Bay",
    laborRevenue: Math.round((labor - primary.laborRevenue) * 100) / 100,
    partsRevenue: Math.round((partsRev - primary.partsRevenue) * 100) / 100,
    partsCost: Math.round((partsCost - primary.partsCost) * 100) / 100,
    commission: Math.round((commission - primary.commission) * 100) / 100,
  };
  return {
    id,
    date: daysAgoISO(daysAgo, 16),
    laborRevenue: labor,
    partsRevenue: partsRev,
    partsCost,
    commission,
    discount,
    paymentMethod: method,
    sectionBreakdown: [primary, secondary],
    description,
    workerId,
  };
}

function makeLedger(): LedgerEntry[] {
  return [
    ledgerEntry("led_01", 11, 6500, 24000, 15000, 1170, "Cash", "Honda Vezel — brake overhaul", 0, "wrk_kamal"),
    ledgerEntry("led_02", 10, 9000, 32000, 19500, 1620, "Card", "Toyota Prius — AC repair", 0, "wrk_nuwan"),
    ledgerEntry("led_03", 9, 5500, 18500, 11200, 990, "Cash", "Suzuki Alto — periodic service", 0, "wrk_sunil"),
    ledgerEntry("led_04", 8, 12000, 30000, 19500, 2160, "Credit", "Lanka Logistics — fleet service (credit)", 0, "wrk_kamal"),
    ledgerEntry("led_05", 7, 7000, 28500, 17000, 1260, "Cash", "Honda Vezel — suspension repair", 0, "wrk_nuwan"),
    ledgerEntry("led_06", 6, 6000, 22000, 13000, 1080, "Cash", "Toyota Aqua — brake service", 0, "wrk_kamal"),
    ledgerEntry("led_07", 5, 9500, 36000, 22000, 1710, "Card", "Nissan Leaf — brake & suspension", 0, "wrk_nuwan"),
    ledgerEntry("led_08", 4, 14500, 86500, 51000, 2610, "Card", "Toyota Land Cruiser — major service", 0, "wrk_kamal"),
    ledgerEntry("led_09", 3, 8000, 31000, 18000, 1440, "Cash", "Suzuki Wagon R — AC repair", 0, "wrk_sunil"),
    ledgerEntry("led_10", 3, 4500, 14500, 8500, 810, "Cash", "Honda Fit — periodic service", 0, "wrk_nuwan"),
    ledgerEntry("led_11", 2, 11000, 38000, 23000, 1980, "Credit", "Kandy Cabs — fleet brake service", 0, "wrk_kamal"),
    ledgerEntry("led_12", 2, 7500, 26000, 15000, 1350, "Cash", "Toyota Axio — full service", 0, "wrk_nuwan"),
    ledgerEntry("led_13", 1, 12500, 44500, 27000, 2250, "Cash", "Mitsubishi Montero — suspension overhaul", 0, "wrk_kamal"),
    ledgerEntry("led_14", 1, 6000, 21000, 12500, 900, "Card", "Honda Grace — AC & service", 0, "wrk_sunil"),
    ledgerEntry("led_15", 1, 8800, 29500, 17500, 1584, "Cash", "Toyota Premio — brake repair", 0, "wrk_nuwan"),
    ledgerEntry("led_16", 0, 4000, 15000, 10400, 720, "Cash", "Suzuki Alto — full service (today)", 500, "wrk_sunil"),
    {
      id: "led_17",
      date: daysAgoISO(2, 15),
      laborRevenue: 0,
      partsRevenue: 0,
      partsCost: 0,
      commission: 0,
      discount: 0,
      paymentMethod: "Credit Settlement",
      settlementAmount: 50000,
      description: "Lanka Logistics — part settlement received",
    },
  ];
}

function makeCredits(): CustomerCredit[] {
  return [
    {
      id: "CR-3001",
      jobCardId: "JC-0990",
      customerName: "Lanka Logistics (Pvt) Ltd",
      vehicleNo: "WP LK-4412",
      phone: "+94 77 450 8899",
      total: 128500,
      paid: 75000,
      creditDate: daysAgoISO(28),
      dueDate: isoDaysFrom(new Date(), 2),
      graceDays: 30,
      status: "Partially Paid",
    },
    {
      id: "CR-3002",
      jobCardId: "JC-0927",
      customerName: "Kandy Cabs (Pvt) Ltd",
      vehicleNo: "CP KC-7781",
      phone: "+94 71 700 2233",
      total: 42000,
      paid: 0,
      creditDate: daysAgoISO(10),
      dueDate: isoDaysFrom(new Date(), 5),
      graceDays: 15,
      status: "Unpaid",
    },
    {
      id: "CR-3003",
      jobCardId: "JC-0910",
      customerName: "Hill Country Tours",
      vehicleNo: "WP HC-3320",
      phone: "+94 76 990 1144",
      total: 35000,
      paid: 35000,
      creditDate: daysAgoISO(40),
      dueDate: daysAgoISO(10),
      graceDays: 30,
      status: "Settled",
    },
  ];
}

function makeMarketing(): MarketingReminder[] {
  return [
    {
      id: "mkt_1",
      vehicleNo: "WP CAV-8742",
      customerName: "A. Perera",
      phone: "+94 77 123 4567",
      triggerType: "Periodic Cycle",
      targetDate: isoDaysFrom(new Date(), 3),
      dispatchDate: daysAgoISO(58),
      readyAt: daysAgoISO(57),
      status: "Pending",
      avgCycleDays: 58,
      createdAt: daysAgoISO(58),
    },
    {
      id: "mkt_2",
      vehicleNo: "WP CAB-5521",
      customerName: "N. Silva",
      phone: "+94 76 221 9080",
      triggerType: "Mileage Milestone",
      targetMileage: 60000,
      dispatchDate: daysAgoISO(2),
      readyAt: daysAgoISO(0),
      status: "Pending",
      createdAt: daysAgoISO(2),
    },
    {
      id: "mkt_3",
      vehicleNo: "WP CBB-2290",
      customerName: "S. Fernando",
      phone: "+94 71 555 7890",
      triggerType: "Periodic Cycle",
      targetDate: isoDaysFrom(new Date(), 12),
      dispatchDate: daysAgoISO(30),
      readyAt: isoDaysFrom(new Date(), 9),
      status: "Pending",
      avgCycleDays: 90,
      createdAt: daysAgoISO(30),
    },
    {
      id: "mkt_4",
      vehicleNo: "WP CAD-1188",
      customerName: "M. Gunasekara",
      phone: "+94 77 655 9011",
      triggerType: "Mileage Milestone",
      targetMileage: 50000,
      dispatchDate: daysAgoISO(21),
      readyAt: daysAgoISO(19),
      status: "Reminder Sent",
      createdAt: daysAgoISO(21),
    },
  ];
}

function makeNotifications(): AppNotification[] {
  return [
    {
      id: "ntf_1",
      departments: ["PRO"],
      title: "New vehicle at the gate",
      message: "WP CAV-8742 (Honda Vezel) is waiting for inspection and approval.",
      priority: "high",
      createdAt: daysAgoISO(0, 8),
      read: false,
      link: "/gate",
    },
    {
      id: "ntf_2",
      departments: ["PRO"],
      title: "New vehicle at the gate",
      message: "WP CBB-2290 (Toyota Aqua) checked in via the QR form.",
      priority: "high",
      createdAt: daysAgoISO(0, 9),
      read: false,
      link: "/gate",
    },
    {
      id: "ntf_3",
      departments: ["Cashier"],
      title: "Repair completed — ready to bill",
      message: "JC-1002 · Toyota Prius · N. Silva. Labour and parts are compiled.",
      priority: "high",
      createdAt: daysAgoISO(0, 10),
      read: false,
      link: "/cashier",
    },
    {
      id: "ntf_4",
      departments: ["PRO"],
      title: "Gate clearance: vehicle paid",
      message: "JC-1003 · Suzuki Alto is paid. Confirm handover and gate out.",
      priority: "normal",
      createdAt: daysAgoISO(0, 10),
      read: false,
      link: "/gate",
    },
    {
      id: "ntf_5",
      departments: ["Owner", "Accounting", "Stores"],
      title: "Supplier credit due in 2 days",
      message: "Hybrid Zone Lanka invoice HZL/26/1841 — LKR 84,500 due soon.",
      priority: "critical",
      createdAt: daysAgoISO(0, 7),
      read: false,
      link: "/accounting",
    },
    {
      id: "ntf_6",
      departments: ["Stores", "Supervisor", "Accounting"],
      title: "Low stock: Toyota Genuine Coolant",
      message: "Only 2 bottles left (minimum 5). Preferred supplier: Lanka Lubricants.",
      priority: "high",
      createdAt: daysAgoISO(0, 6),
      read: false,
      link: "/stores",
    },
    {
      id: "ntf_7",
      departments: ["Owner", "Accounting"],
      title: "Customer credit due",
      message: "Lanka Logistics — LKR 78,500 remaining, due in 2 days.",
      priority: "high",
      createdAt: daysAgoISO(0, 6),
      read: false,
      link: "/accounting",
    },
    {
      id: "ntf_8",
      departments: ["Owner", "PRO"],
      title: "2-day follow-up ready",
      message: "Toyota Prius (WP CAB-5521) is approaching its 60,000 km service. Send the mileage reminder.",
      priority: "normal",
      createdAt: daysAgoISO(0, 8),
      read: false,
      link: "/marketing",
    },
  ];
}

function makeInsuranceCompanies(): InsuranceCompany[] {
  const companies: InsuranceCompany[] = [
    {
      id: "ins_ceylinco",
      name: "Ceylinco General Insurance",
      address: "106/1 Dr. Colvin R. de Silva Mawatha, Colombo 02",
      email: "info@ceylincogeneral.lk",
      hotline: "+94 11 242 2292",
      website: "https://www.ceylincogeneral.lk",
    },
    {
      id: "ins_slic",
      name: "Sri Lanka Insurance Corporation",
      address: "21 Vauxhall Street, Colombo 02",
      email: "info@srilankainsurance.com",
      hotline: "1989 / +94 11 235 4444",
      website: "https://www.srilankainsurance.com",
    },
    {
      id: "ins_allianz",
      name: "Allianz Insurance Lanka",
      address: "12th Floor, One Galle Face Tower, Colombo 02",
      email: "hello@allianz.lk",
      hotline: "+94 11 260 0600",
      website: "https://www.allianz.lk",
    },
    {
      id: "ins_aia",
      name: "AIA Insurance Lanka",
      address: "21 Dharmapala Mawatha, Colombo 03",
      email: "customer.service@aia.lk",
      hotline: "+94 11 266 6600",
      website: "https://www.aia.lk",
    },
    {
      id: "ins_union",
      name: "Union Assurance",
      address: "20 St Michael's Road, Colombo 03",
      email: "info@unionassurance.com",
      hotline: "+94 11 245 4400",
      website: "https://www.unionassurance.com",
    },
    {
      id: "ins_janashakthi",
      name: "Janashakthi Insurance",
      address: "45 Janadhipathi Mawatha, Colombo 01",
      email: "info@janashakthi.com",
      hotline: "+94 11 242 4444",
      website: "https://www.janashakthi.com",
    },
    {
      id: "ins_continental",
      name: "Continental Insurance Lanka",
      address: "281 Union Place, Colombo 02",
      email: "info@continental.lk",
      hotline: "+94 11 230 5555",
      website: "https://www.continental.lk",
    },
    {
      id: "ins_orient",
      name: "Orient Insurance",
      address: "46/1 Park Street, Colombo 02",
      email: "info@orient.lk",
      hotline: "+94 11 242 2424",
      website: "https://www.orient.lk",
    },
    {
      id: "ins_hnb",
      name: "HNB Assurance",
      address: "409 Galle Road, Colombo 03",
      email: "info@hnbassurance.com",
      hotline: "+94 11 256 4564",
      website: "https://www.hnbassurance.com",
    },
    {
      id: "ins_peoples",
      name: "People's Insurance",
      address: "People's Bank Head Office, 75 Sir Chittampalam A. Gardiner Mawatha, Colombo 02",
      email: "info@peoplesinsurance.lk",
      hotline: "+94 11 220 7000",
      website: "https://www.peoplesinsurance.lk",
    },
  ];
  return companies.map((company) => ({
    ...company,
    tinNumber: company.tinNumber ?? "",
    active: company.active !== false,
  }));
}

const bankAccountIds = {
  cash: "acc_cash",
  boc: "acc_boc",
  commercial: "acc_commercial",
};

function makeBankAccounts(): BankAccount[] {
  return [
    {
      id: bankAccountIds.cash,
      name: "Workshop Cash Drawer",
      bankName: "Cash",
      branch: "Kandy",
      accountNumber: "CASH-01",
      type: "Cash",
      openingBalance: 50000,
      active: true,
      createdAt: daysAgoISO(365),
    },
    {
      id: bankAccountIds.boc,
      name: "Bank of Ceylon — Current",
      bankName: "Bank of Ceylon",
      branch: "Peradeniya",
      accountNumber: "0079456123",
      type: "Bank",
      openingBalance: 350000,
      active: true,
      createdAt: daysAgoISO(365),
    },
    {
      id: bankAccountIds.commercial,
      name: "Commercial Bank — Savings",
      bankName: "Commercial Bank",
      branch: "Kandy",
      accountNumber: "8001234567",
      type: "Bank",
      openingBalance: 180000,
      active: true,
      createdAt: daysAgoISO(365),
    },
  ];
}

function makeBankTransactions(): BankTransaction[] {
  return [
    {
      id: "btx_01",
      accountId: bankAccountIds.cash,
      date: daysAgoISO(1, 16),
      direction: "Credit_In",
      amount: 38500,
      category: "Vehicle Payment",
      description: "JC-1003 · WP CBA-7733 · Cash",
      reference: "JC-1003",
      linkedType: "Job",
      linkedId: "JC-1003",
      createdBy: "Ishara Jayasuriya",
    },
    {
      id: "btx_02",
      accountId: bankAccountIds.boc,
      date: daysAgoISO(1, 9),
      direction: "Debit_Out",
      amount: 15000,
      category: "Petty Cash Top-up",
      description: "PCT-5001 · cashier float top-up",
      reference: "PCT-5001",
      linkedType: "Petty_Cash",
      linkedId: "pc_1",
      createdBy: "Malini Abeywickrama",
    },
    {
      id: "btx_03",
      accountId: bankAccountIds.boc,
      date: daysAgoISO(2, 14),
      direction: "Credit_In",
      amount: 50000,
      category: "Credit Settlement",
      description: "Lanka Logistics — part settlement",
      reference: "CR-3001",
      linkedType: "Credit",
      linkedId: "CR-3001",
      createdBy: "Malini Abeywickrama",
    },
    {
      id: "btx_04",
      accountId: bankAccountIds.commercial,
      date: daysAgoISO(3, 11),
      direction: "Debit_Out",
      amount: 25000,
      category: "Loan Installment",
      description: "Sampath Bank SME term loan — monthly installment",
      reference: "loan_ws_1",
      linkedType: "Loan",
      linkedId: "loan_ws_1",
      createdBy: "Malini Abeywickrama",
    },
    {
      id: "btx_05",
      accountId: bankAccountIds.boc,
      date: daysAgoISO(9, 15),
      direction: "Debit_Out",
      amount: 45500,
      category: "Supplier Payment",
      description: "APH/26/903 · PO-8830 paid in cash",
      reference: "PO-8830",
      linkedType: "Supplier",
      linkedId: supplierIds.partsHub,
      createdBy: "Malini Abeywickrama",
    },
    {
      id: "btx_06",
      accountId: bankAccountIds.commercial,
      date: daysAgoISO(7, 10),
      direction: "Debit_Out",
      amount: 14500,
      category: "Electricity",
      description: "CEB bill — workshop & compressor",
      reference: "CEB-26-04",
      linkedType: "Manual",
      createdBy: "Malini Abeywickrama",
    },
    {
      id: "btx_07",
      accountId: bankAccountIds.boc,
      date: daysAgoISO(11, 9),
      direction: "Debit_Out",
      amount: 45000,
      category: "Rental",
      description: "Workshop premises monthly rent",
      reference: "RENT-26-04",
      linkedType: "Manual",
      createdBy: "Malini Abeywickrama",
    },
    {
      id: "btx_08",
      accountId: bankAccountIds.boc,
      date: daysAgoISO(20, 8),
      direction: "Credit_In",
      amount: 32000,
      category: "Card Settlement",
      description: "Card terminal settlement batch",
      reference: "CARD-1182",
      linkedType: "Manual",
      createdBy: "Malini Abeywickrama",
    },
    ...makeWorkshopLoanPayments().map((payment, index): BankTransaction => ({
      id: `btx_loan_${index + 1}`,
      accountId: payment.bankAccountId ?? bankAccountIds.commercial,
      date: payment.date,
      direction: "Debit_Out",
      amount: payment.amount,
      category: "Loan Installment",
      description: `Workshop loan installment · ${payment.receiptNo}`,
      reference: payment.receiptNo,
      linkedType: "Loan",
      linkedId: payment.loanId,
      createdBy: payment.recordedBy,
    })),
  ];
}

function makePettyCash(): PettyCashEntry[] {
  return [
    {
      id: "pc_1",
      date: daysAgoISO(1, 9),
      type: "Float_Topup",
      category: "Float",
      amount: 15000,
      description: "Monthly petty cash float top-up from Bank of Ceylon",
      receiptNo: "PCT-5001",
      createdAt: daysAgoISO(1, 9),
      recordedBy: "Ishara Jayasuriya",
      bankAccountId: bankAccountIds.boc,
    },
    {
      id: "pc_2",
      voucherNo: "PCV-7001",
      date: daysAgoISO(8, 11),
      type: "Expense",
      category: "Fuel",
      amount: 4500,
      description: "Fuel for parts collection run to Colombo",
      paidTo: "Sampath Weerasinghe",
      receiptNo: "PCV-7001",
      createdAt: daysAgoISO(8, 11),
      recordedBy: "Ishara Jayasuriya",
    },
    {
      id: "pc_3",
      voucherNo: "PCV-7002",
      date: daysAgoISO(6, 15),
      type: "Expense",
      category: "Transport",
      amount: 1800,
      description: "Three-wheeler hire for customer document delivery",
      paidTo: "Kandy City Cabs",
      receiptNo: "PCV-7002",
      createdAt: daysAgoISO(6, 15),
      recordedBy: "Ishara Jayasuriya",
    },
    {
      id: "pc_4",
      voucherNo: "PCV-7003",
      date: daysAgoISO(3, 10),
      type: "Expense",
      category: "Office Supplies",
      amount: 2600,
      description: "Invoice pads, toner and receipt rolls",
      paidTo: "Sarasavi Stationers",
      receiptNo: "PCV-7003",
      createdAt: daysAgoISO(3, 10),
      recordedBy: "Malini Abeywickrama",
    },
    {
      id: "pc_5",
      voucherNo: "PCV-7004",
      date: daysAgoISO(1, 14),
      type: "Expense",
      category: "Refreshments",
      amount: 1200,
      description: "Tea and short eats for the workshop floor",
      paidTo: "Peradeniya Bakery",
      receiptNo: "PCV-7004",
      createdAt: daysAgoISO(1, 14),
      recordedBy: "Ishara Jayasuriya",
    },
  ];
}

function makeCustomerCheques(): CustomerCheque[] {
  return [
    {
      id: "chq_1",
      source: "Checkout",
      jobCardId: "JC-0985",
      customerName: "S. Fernando",
      vehicleNo: "WP CBB-2290",
      phone: "+94 71 555 7890",
      chequeNo: "102345",
      bank: "Bank of Ceylon",
      branch: "Kandy",
      chequeDate: isoDaysFrom(new Date(), 6),
      amount: 68500,
      status: "In_Safe",
      receivedAt: daysAgoISO(1, 12),
      receivedBy: "Ishara Jayasuriya",
      note: "Post-dated cheque held in the safe until the customer's salary date.",
    },
    {
      id: "chq_2",
      source: "Credit",
      creditId: "CR-3001",
      jobCardId: "JC-0990",
      customerName: "Lanka Logistics (Pvt) Ltd",
      vehicleNo: "WP LK-4412",
      phone: "+94 77 450 8899",
      chequeNo: "440128",
      bank: "Commercial Bank",
      branch: "Colombo Fort",
      chequeDate: daysAgoISO(4),
      amount: 25000,
      status: "Deposited",
      receivedAt: daysAgoISO(5, 10),
      receivedBy: "Malini Abeywickrama",
      bankAccountId: bankAccountIds.commercial,
    },
    {
      id: "chq_3",
      source: "Credit",
      creditId: "CR-3002",
      jobCardId: "JC-0927",
      customerName: "Kandy Cabs (Pvt) Ltd",
      vehicleNo: "CP KC-7781",
      phone: "+94 71 700 2233",
      chequeNo: "771904",
      bank: "Sampath Bank",
      branch: "Kandy",
      chequeDate: daysAgoISO(6),
      amount: 15000,
      status: "Bounced",
      bounceReason: "Insufficient funds — returned by issuing bank",
      receivedAt: daysAgoISO(7, 16),
      receivedBy: "Malini Abeywickrama",
    },
  ];
}

function makeCreditPayments(): CreditPayment[] {
  return [
    {
      id: "crp_1",
      creditId: "CR-3001",
      amount: 50000,
      method: "Cash",
      date: daysAgoISO(2, 14),
      recordedBy: "Malini Abeywickrama",
    },
    {
      id: "crp_2",
      creditId: "CR-3001",
      amount: 25000,
      method: "Cheque",
      date: daysAgoISO(5, 10),
      chequeId: "chq_2",
      bankAccountId: bankAccountIds.commercial,
      recordedBy: "Malini Abeywickrama",
    },
    {
      id: "crp_3",
      creditId: "CR-3002",
      amount: 15000,
      method: "Cheque",
      date: daysAgoISO(7, 16),
      chequeId: "chq_3",
      recordedBy: "Malini Abeywickrama",
      reversed: true,
    },
  ];
}

function makeSupplierCheques(): SupplierCheque[] {
  return [
    {
      id: "schq_1",
      supplierId: supplierIds.hybrid,
      purchaseId: "PO-8841",
      chequeNo: "550112",
      bank: "Commercial Bank",
      branch: "Peradeniya",
      chequeDate: isoDaysFrom(new Date(), 10),
      amount: 84500,
      status: "Issued_PDC",
      issuedAt: daysAgoISO(2, 10),
      issuedBy: "Malini Abeywickrama",
      note: "Post-dated cheque issued for invoice HZL/26/1841.",
    },
  ];
}

function makeSupplierReturns(): SupplierReturn[] {
  return [
    {
      id: "sret_1",
      supplierId: supplierIds.hybrid,
      purchaseId: "PO-8841",
      invoiceNo: "HZL/26/1841",
      date: daysAgoISO(10),
      total: 7000,
      reason: "Two air filters were the wrong model and were returned to the supplier.",
      lines: [
        { itemId: "itm_air_vezel", itemName: "Air Filter", qty: 2, costPrice: 3500 },
      ],
      createdBy: "Sampath Weerasinghe",
      creditNoteNo: "SCN-7002",
    },
  ];
}

function makeStockMovements(
  inventory: InventoryItem[],
  purchases: SupplierPurchase[],
  parts: JobPart[],
  supplierReturns: SupplierReturn[],
): StockMovement[] {
  const movements: StockMovement[] = [];
  purchases.forEach((purchase) => {
    (purchase.lines ?? []).forEach((line) => {
      movements.push({
        id: uid("stk"),
        itemId: line.itemId,
        itemName: line.itemName,
        date: purchase.purchaseDate,
        type: "Purchase",
        qty: line.qty,
        reference: purchase.invoiceNo,
        note: `Purchase ${purchase.id}`,
        createdBy: purchase.goodsConfirmedBy,
      });
    });
  });
  parts
    .filter((part) => part.qtyIssued > 0)
    .forEach((part) => {
      movements.push({
        id: uid("stk"),
        itemId: part.itemId,
        itemName: part.itemName,
        date: part.updatedAt,
        type: "Job_Issue",
        qty: -part.qtyIssued,
        reference: part.jobCardId,
        note: `Issued to ${part.jobCardId}`,
        createdBy: "Ruwan Fernando",
      });
    });
  supplierReturns.forEach((entry) => {
    entry.lines.forEach((line) => {
      movements.push({
        id: uid("stk"),
        itemId: line.itemId,
        itemName: line.itemName,
        date: entry.date,
        type: "Supplier_Return",
        qty: -line.qty,
        reference: entry.creditNoteNo ?? entry.invoiceNo,
        note: entry.reason,
        createdBy: entry.createdBy,
      });
    });
  });
  const opening: StockMovement[] = inventory.map((item) => {
    const net = movements
      .filter((movement) => movement.itemId === item.id)
      .reduce((sum, movement) => sum + movement.qty, 0);
    return {
      id: uid("stk"),
      itemId: item.id,
      itemName: item.name,
      date: daysAgoISO(95),
      type: "Opening_Stock",
      qty: Math.max(0, item.stock - net),
      reference: "OPENING",
      note: "Opening stock count at setup",
      createdBy: "Nimal Perera",
      isOpeningStock: true,
    };
  });
  return [...opening, ...movements].sort((a, b) => b.date.localeCompare(a.date));
}

function makeWorkshopLoans(): WorkshopLoan[] {
  return [
    {
      id: "loan_ws_1",
      lender: "Sampath Bank — SME Term Loan",
      purpose: "Two-post lift and wheel alignment equipment upgrade",
      principal: 500000,
      balance: 350000,
      monthlyInstallment: 25000,
      startDate: daysAgoISO(210),
      nextDueDate: isoDaysFrom(new Date(), 8),
      status: "Active",
      createdAt: daysAgoISO(210),
    },
    {
      id: "loan_ws_2",
      lender: "People's Leasing — Tool Van",
      purpose: "Tool van lease for mobile service calls",
      principal: 850000,
      balance: 612000,
      monthlyInstallment: 38500,
      startDate: daysAgoISO(160),
      nextDueDate: isoDaysFrom(new Date(), 3),
      status: "Active",
      createdAt: daysAgoISO(160),
    },
  ];
}

function makeWorkshopLoanPayments(): WorkshopLoanPayment[] {
  return [
    {
      id: "wlp_1",
      loanId: "loan_ws_1",
      amount: 25000,
      date: daysAgoISO(90, 10),
      method: "Bank Transfer",
      bankAccountId: bankAccountIds.commercial,
      receiptNo: "WLP-2001",
      recordedBy: "Malini Abeywickrama",
    },
    {
      id: "wlp_2",
      loanId: "loan_ws_1",
      amount: 25000,
      date: daysAgoISO(60, 10),
      method: "Bank Transfer",
      bankAccountId: bankAccountIds.commercial,
      receiptNo: "WLP-2002",
      recordedBy: "Malini Abeywickrama",
    },
    {
      id: "wlp_3",
      loanId: "loan_ws_1",
      amount: 25000,
      date: daysAgoISO(30, 10),
      method: "Bank Transfer",
      bankAccountId: bankAccountIds.commercial,
      receiptNo: "WLP-2003",
      recordedBy: "Malini Abeywickrama",
    },
    {
      id: "wlp_4",
      loanId: "loan_ws_2",
      amount: 38500,
      date: daysAgoISO(80, 11),
      method: "Bank Transfer",
      bankAccountId: bankAccountIds.commercial,
      receiptNo: "WLP-2004",
      recordedBy: "Malini Abeywickrama",
    },
    {
      id: "wlp_5",
      loanId: "loan_ws_2",
      amount: 38500,
      date: daysAgoISO(50, 11),
      method: "Bank Transfer",
      bankAccountId: bankAccountIds.commercial,
      receiptNo: "WLP-2005",
      recordedBy: "Malini Abeywickrama",
    },
    {
      id: "wlp_6",
      loanId: "loan_ws_2",
      amount: 38500,
      date: daysAgoISO(20, 11),
      method: "Bank Transfer",
      bankAccountId: bankAccountIds.commercial,
      receiptNo: "WLP-2006",
      recordedBy: "Malini Abeywickrama",
    },
  ];
}

function makeEstimates(): JobEstimate[] {
  return [
    {
      id: "est_1005_initial",
      jobCardId: "JC-1005",
      kind: "Initial",
      number: "EST-2026-0001",
      revision: 2,
      status: "Approved",
      lines: [
        { id: "el_1", type: "Labour", description: "Bumper removal and refit", qty: 1, unitPrice: 3500, approvalStatus: "Approved", approvedUnitPrice: 3000 },
        { id: "el_2", type: "Labour", description: "Headlamp replacement", qty: 1, unitPrice: 1800, approvalStatus: "Approved", approvedUnitPrice: 1800 },
        { id: "el_3", type: "Labour", description: "Panel alignment and gap setting", qty: 1, unitPrice: 2500, approvalStatus: "Approved", approvedUnitPrice: 2200 },
        { id: "el_4", type: "Part", description: "Front bumper assembly", qty: 1, unitPrice: 48300, approvalStatus: "Approved", approvedUnitPrice: 45500 },
        { id: "el_5", type: "Part", description: "Headlamp assembly — left", qty: 1, unitPrice: 33630, approvalStatus: "Approved", approvedUnitPrice: 33630 },
        { id: "el_6", type: "Part", description: "Paint and consumables", qty: 1, unitPrice: 9500, approvalStatus: "Approved", approvedUnitPrice: 9500 },
      ],
      notes: "Revised after assessor inspection. Initial assessor estimate approved by Ceylinco General Insurance.",
      createdAt: daysAgoISO(3, 10),
      updatedAt: daysAgoISO(3, 14),
      createdBy: "Ruwan Fernando",
      approvedAt: daysAgoISO(3, 15),
      approvedBy: "Nimal Perera",
    },
    {
      id: "est_1005_supp",
      jobCardId: "JC-1005",
      kind: "Supplementary",
      number: "EST-2026-0002",
      supplementaryNo: 1,
      revision: 1,
      status: "Awaiting Approval",
      lines: [
        { id: "el_7", type: "Labour", description: "Paint blending — bonnet and fenders", qty: 1, unitPrice: 12000, approvalStatus: "Pending" },
        { id: "el_8", type: "Part", description: "Bumper bracket kit", qty: 1, unitPrice: 4500, approvalStatus: "Pending" },
      ],
      notes: "Supplementary estimate raised after bumper removal revealed a damaged bracket.",
      createdAt: daysAgoISO(1, 11),
      updatedAt: daysAgoISO(1, 11),
      createdBy: "Ruwan Fernando",
    },
  ];
}

function makeInsuranceClaims(): InsuranceClaim[] {
  return [
    {
      id: "clm_1",
      jobCardId: "JC-1005",
      insurerId: "ins_ceylinco",
      claimNo: "CG/26/CL/4410",
      policyNo: "CG-POL-778812",
      assessorName: "M. Faleel",
      assessorPhone: "+94 77 345 9911",
      estimateStatus: "Approved",
      estimateApprovedAt: daysAgoISO(3, 15),
      partsStatus: "Approved",
      partsApprovedAt: daysAgoISO(2, 11),
      salvageStatus: "Pending",
      status: "Parts Approved",
      createdAt: daysAgoISO(3, 9),
    },
  ];
}

function makeVehicleBills(): VehicleBill[] {
  return [
    {
      id: "bill_1",
      jobCardId: "JC-1005",
      vehicleNo: "WP CAJ-4410",
      kind: "Insurance",
      billNo: "INS-CG/26/CL/4410",
      amount: 86130,
      netPayable: 86130,
      laborSubtotal: 7000,
      partsSubtotal: 79130,
      taskIds: ["tsk_11", "tsk_12", "tsk_13"],
      partIds: ["jp_18", "jp_19"],
      createdAt: daysAgoISO(2, 16),
      createdBy: "Nimal Perera",
      claimId: "clm_1",
      insurerId: "ins_ceylinco",
      notes: "Insurer share for the accident repair.",
      sentAt: daysAgoISO(2, 16),
      sentBy: "Nimal Perera",
      status: "Awaiting Release Order",
    },
    {
      id: "bill_2",
      jobCardId: "JC-1005",
      vehicleNo: "WP CAJ-4410",
      kind: "Customer",
      billNo: "CUS-JC-1005-2",
      amount: 13450,
      netPayable: 13450,
      laborSubtotal: 2500,
      partsSubtotal: 10950,
      taskIds: ["tsk_14"],
      partIds: ["jp_21", "jp_22"],
      createdAt: daysAgoISO(2, 16),
      createdBy: "Nimal Perera",
      claimId: "clm_1",
      notes: "Customer excess, courtesy wash and consumables, billed separately.",
      sentAt: daysAgoISO(2, 16),
      sentBy: "Nimal Perera",
      status: "Unpaid",
    },
  ];
}

function makeAdvancePayments(): AdvancePayment[] {
  return [
    {
      id: "adv_1",
      jobCardId: "JC-1001",
      customerName: "A. Perera",
      vehicleNo: "WP CAV-8742",
      phone: "+94 77 123 4567",
      amount: 10000,
      method: "Cash",
      receiptNo: "ADV-4001",
      note: "Brake repair deposit",
      createdAt: daysAgoISO(0, 10),
      recordedBy: "Ishara Jayasuriya",
    },
  ];
}

function makeAttendance(): AttendanceRecord[] {
  const workers = [
    "wrk_kamal",
    "wrk_nuwan",
    "wrk_sunil",
    "wrk_ruwan",
    "wrk_chaminda",
  ];
  const records: AttendanceRecord[] = [];
  const now = new Date();
  for (let offset = 9; offset >= 0; offset -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = localDateKey(day);
    workers.forEach((workerId) => {
      let status: AttendanceRecord["status"] = "Present";
      if (offset === 4 && workerId === "wrk_sunil") status = "Absent";
      if (offset === 7 && workerId === "wrk_nuwan") status = "Off Day";
      records.push({
        id: `att_${key}_${workerId}`,
        date: key,
        workerId,
        status,
        markedAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8, 15).toISOString(),
        markedBy: "Ruwan Fernando",
      });
    });
  }
  return records;
}

function makeStaffLoans(): StaffLoan[] {
  return [
    {
      id: "loan_1",
      workerId: "wrk_kamal",
      date: daysAgoISO(120),
      principal: 60000,
      balance: 40000,
      monthlyDeduction: 5000,
      reason: "School admission and home repairs",
      status: "Active",
    },
    {
      id: "loan_2",
      workerId: "wrk_nuwan",
      date: daysAgoISO(75),
      principal: 30000,
      balance: 18000,
      monthlyDeduction: 3000,
      reason: "Motorcycle purchase",
      status: "Active",
    },
  ];
}

function makePayslips(): Payslip[] {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const { start, end } = monthBounds(lastMonth);
  const paidAt = new Date(now.getFullYear(), now.getMonth(), 0, 16, 0, 0).toISOString();
  return [
    {
      id: "pay_1",
      workerId: "wrk_kamal",
      periodStart: start,
      periodEnd: end,
      workedDays: 26,
      workingDays: 26,
      basic: 45000,
      commission: 6750,
      loanDeduction: 5000,
      epfEmployee: 4140,
      epfEmployer: 6210,
      etfEmployer: 1552.5,
      otherDeductions: 0,
      gross: 51750,
      net: 42610,
      paidAt,
      paidBy: "Malini Abeywickrama",
      note: "Paid by bank transfer.",
    },
    {
      id: "pay_2",
      workerId: "wrk_nuwan",
      periodStart: start,
      periodEnd: end,
      workedDays: 26,
      workingDays: 26,
      basic: 40000,
      commission: 5400,
      loanDeduction: 3000,
      epfEmployee: 3632,
      epfEmployer: 5448,
      etfEmployer: 1362,
      otherDeductions: 0,
      gross: 45400,
      net: 38768,
      paidAt,
      paidBy: "Malini Abeywickrama",
    },
    {
      id: "pay_3",
      workerId: "wrk_sunil",
      periodStart: start,
      periodEnd: end,
      workedDays: 26,
      workingDays: 26,
      basic: 30000,
      commission: 2800,
      loanDeduction: 0,
      epfEmployee: 2624,
      epfEmployer: 3936,
      etfEmployer: 984,
      otherDeductions: 0,
      gross: 32800,
      net: 30176,
      paidAt,
      paidBy: "Malini Abeywickrama",
    },
    {
      id: "pay_4",
      workerId: "wrk_ruwan",
      periodStart: start,
      periodEnd: end,
      workedDays: 26,
      workingDays: 26,
      basic: 55000,
      commission: 4950,
      loanDeduction: 0,
      epfEmployee: 4796,
      epfEmployer: 7194,
      etfEmployer: 1798.5,
      otherDeductions: 0,
      gross: 59950,
      net: 55154,
      paidAt,
      paidBy: "Malini Abeywickrama",
    },
  ];
}

function makeWagePayouts(): WagePayout[] {
  return [
    {
      id: "wage_1",
      workerId: "wrk_chaminda",
      date: localDateKey(new Date(Date.now() - 4 * 86400000)),
      days: 3,
      baseAmount: 13500,
      commissionAmount: 0,
      commissionIncluded: false,
      amount: 13500,
      receiptNo: "WAGE-9001",
      paidAt: daysAgoISO(4, 18),
      paidBy: "Malini Abeywickrama",
    },
  ];
}

function makeSupplierCreditNotes(): SupplierCreditNote[] {
  return [
    {
      id: "scn_1",
      supplierId: supplierIds.partsHub,
      partId: "jp_17",
      jobCardId: "JC-0985",
      supplierInvoiceNo: "APH/26/1871",
      creditNoteNo: "SCN-7001",
      amount: 3900,
      date: daysAgoISO(12),
      reason: "Defective cabin air filter replaced under supplier warranty.",
      status: "Applied",
    },
  ];
}

function makeServiceRecords(
  jobCards: JobCard[],
  tasks: JobTask[],
  parts: JobPart[],
  workers: WorkerProfile[],
): ServiceRecord[] {
  return jobCards
    .filter((job) => job.completedAt)
    .map((job) => {
      const jobTasks = tasks.filter((task) => task.jobCardId === job.id);
      const jobParts = parts.filter((part) => part.jobCardId === job.id);
      const totals = jobTotals(job, tasks, parts, workers);
      return {
        id: `svc_${job.id}`,
        jobCardId: job.id,
        vehicleNo: job.vehicleNo,
        make: job.make,
        model: job.model,
        customerName: job.customerName,
        date: job.completedAt ?? job.createdAt,
        mileage: job.mileage,
        repairType: job.repairType,
        tasks: jobTasks.map((task) => ({
          name: task.name,
          workerId: taskWorkerIds(task)[0] ?? "",
          workerName:
            taskWorkers(task, workers)
              .map((worker) => worker.fullName)
              .join(", ") || "Unassigned",
          laborCost: task.laborCost,
        })),
        parts: jobParts.map((part) => ({
          itemName: part.itemName,
          supplierId: part.supplierId,
          supplierInvoiceNo: part.supplierInvoiceNo,
          qty: Math.max(1, part.qtyIssued),
          sellingPrice: part.sellingPrice,
          status: part.status,
        })),
        total: totals.total,
      };
    });
}


function makeOpenContainers(): OpenContainer[] {
  return [
    {
      id: "can_carb_01",
      itemId: "itm_carb_cleaner",
      itemName: "Carb & Throttle Cleaner",
      sectionId: demoSectionIds.mechanical,
      label: "Carb cleaner · Mechanical bay",
      capacity: 450,
      remainingQty: 200,
      unit: "ml",
      costPerUnit: 2850 / 450,
      sellingPricePerUnit: 4200 / 450,
      status: "Open",
      openedAt: daysAgoISO(0, 9),
      openedBy: "Sampath Weerasinghe",
      issues: [
        {
          id: "can_issue_01",
          jobCardId: "JC-1001",
          partId: "jp_20",
          qty: 250,
          issuedAt: daysAgoISO(0, 10),
          issuedBy: "Ruwan Fernando",
        },
      ],
    },
    {
      id: "can_cataloy_01",
      itemId: "itm_cataloy",
      itemName: "Cataloy Body Filler",
      sectionId: demoSectionIds.body,
      label: "Cataloy · Body & Paint bay",
      capacity: 1000,
      remainingQty: 700,
      unit: "g",
      costPerUnit: 5200 / 1000,
      sellingPricePerUnit: 8500 / 1000,
      status: "Open",
      openedAt: daysAgoISO(3, 9),
      openedBy: "Sampath Weerasinghe",
      issues: [
        {
          id: "can_issue_02",
          jobCardId: "JC-1005",
          partId: "jp_21",
          qty: 300,
          issuedAt: daysAgoISO(3, 10),
          issuedBy: "Ruwan Fernando",
        },
      ],
    },
    {
      id: "can_paint_01",
      itemId: "itm_2k_paint",
      itemName: "2K Paint — Pearl White",
      sectionId: demoSectionIds.body,
      label: "2K Pearl White · Paint mixing room",
      capacity: 1000,
      remainingQty: 650,
      unit: "ml",
      costPerUnit: 16000 / 1000,
      sellingPricePerUnit: 24000 / 1000,
      status: "Open",
      openedAt: daysAgoISO(3, 9),
      openedBy: "Sampath Weerasinghe",
      issues: [
        {
          id: "can_issue_03",
          jobCardId: "JC-1005",
          partId: "jp_22",
          qty: 350,
          issuedAt: daysAgoISO(3, 11),
          issuedBy: "Ruwan Fernando",
        },
      ],
    },
  ];
}

function makeAppointments(): Appointment[] {
  const at = (offsetDays: number, hour: number, minute = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const created = daysAgoISO(0, 8);
  return [
    {
      id: "apt_1001",
      reference: "APT-1001",
      createdAt: created,
      updatedAt: created,
      token: "BOOK-WS-LK-DEMO0001",
      customerName: "Tharindu Silva",
      phone: "+94 77 452 8890",
      vehicleNo: "CAR-8842",
      vehicleModel: "Toyota Aqua 2017",
      repairType: "Full service",
      scheduledAt: at(1, 9, 0),
      status: "Pending",
      source: "Booking link",
      notes: "Customer asked for an early slot before work.",
    },
    {
      id: "apt_1002",
      reference: "APT-1002",
      createdAt: daysAgoISO(1, 15),
      updatedAt: daysAgoISO(0, 9),
      token: "BOOK-WS-LK-DEMO0001",
      customerName: "Nadeesha Perera",
      phone: "+94 76 118 2244",
      vehicleNo: "CBB-1290",
      vehicleModel: "Honda Vezel 2016",
      repairType: "AC inspection",
      scheduledAt: at(1, 11, 30),
      status: "Confirmed",
      source: "Booking link",
      confirmedAt: daysAgoISO(0, 9),
      confirmedBy: "Ruwan Bandara",
      notes: "Confirm the AC gas top-up price on arrival.",
    },
    {
      id: "apt_1003",
      reference: "APT-1003",
      createdAt: daysAgoISO(2, 11),
      updatedAt: daysAgoISO(0, 8),
      token: "BOOK-WS-LK-DEMO0001",
      customerName: "Kasun Jayawardena",
      phone: "+94 71 903 5511",
      vehicleNo: "KV-7712",
      vehicleModel: "Suzuki Alto 2019",
      repairType: "Brake noise check",
      scheduledAt: at(0, 8, 30),
      status: "Fulfilled",
      source: "Staff",
      createdBy: "Kasun Perera",
      confirmedAt: daysAgoISO(1, 16),
      confirmedBy: "Ruwan Bandara",
      fulfilledAt: at(0, 8, 45),
      checkInId: "CI-2044",
    },
  ];
}

export function createDemoState(): AppState {
  const settings: WorkshopSettings = {
    companyName: "Vezel Masters Kandy",
    address: "No. 12, Peradeniya Road, Kandy, Sri Lanka",
    phone: "+94 81 234 5678",
    email: "care@vezelmasters.lk",
    logo: logoDataUrl(),
    brandColor: "#0f766e",
    accentColor: "#f59e0b",
    googleReviewUrl: "https://g.page/r/vezel-masters-kandy/review",
    currency: "LKR",
    qrSlug: "vezel-masters-kandy",
    ownerPassword: "owner123",
    ownerCapital: 500000,
    configured: true,
    demoMode: true,
    createdAt: daysAgoISO(1300),
    workingDays: [1, 2, 3, 4, 5, 6],
    epfEmployeeRate: 8,
    epfEmployerRate: 12,
    etfRate: 3,
    trialStartedAt: daysAgoISO(2),
    licenseHolder: "Vezel Masters Kandy",
    tinNumber: "123456789-7000",
    vatRegNumber: "123456789-7000",
    defaultVatRate: 18,
    placeOfSupply: "Kandy, Sri Lanka",
    footerInquiryLine: "Any inquiry, please call our workshop hotline.",
    footerComplaintLine:
      "Any suggestion or complaint regarding your vehicle or job, please contact management.",
    printerMode: "Both",
    thermalPaperWidth: "80mm",
    standardPaperSize: "A4",
    bookingToken: "BOOK-WS-LK-DEMO0001",
    whatsappMode: "WAHA",
    whatsappGatewayUrl: "http://localhost:3000",
    whatsappSession: "vezel-masters",
    whatsappCompanyNumber: "+94 81 234 5678",
    whatsappConnected: true,
    whatsappAutoSend: true,
    whatsappOwnerNotify: true,
    featureFlags: allFeatureFlags(true),
    storesTopology: "Central",
    installationId: "WS-LK-DEMO0001",
    licenseStatus: "Active",
    licensePlan: "Enterprise",
    lastLicenceSyncAt: daysAgoISO(0, 8),
  };

  const sections = makeSections();
  const allSectionIds = sections.map((section) => section.id);
  const jobCards = makeJobCards().map((job) => ({
    ...job,
    sectionIds: sectionsForRepair(job.repairType),
  }));
  const tasks = makeTasks().map((task) => ({
    ...task,
    sectionId: sectionForTask(task.name),
  }));
  const parts = makeParts().map((part) => ({
    ...part,
    sectionId:
      part.sectionId ??
      jobCards.find((job) => job.id === part.jobCardId)?.sectionIds?.[0] ??
      demoSectionIds.mechanical,
  }));
  const workers = makeWorkers().map((worker) => ({
    ...worker,
    sectionIds:
      worker.id === "wrk_kamal"
        ? [demoSectionIds.mechanical]
        : worker.id === "wrk_nuwan"
          ? [demoSectionIds.electrical]
          : worker.id === "wrk_sunil"
            ? [demoSectionIds.service]
            : worker.id === "wrk_ruwan"
              ? [demoSectionIds.mechanical, demoSectionIds.service]
              : [demoSectionIds.body],
  }));
  const users = makeUsers().map((user) => ({
    ...user,
    sectionIds:
      user.id === "usr_pro" || user.id === "usr_cashier" || user.id === "usr_accounts"
        ? allSectionIds
        : user.id === "usr_supervisor"
          ? allSectionIds
          : user.id === "usr_store"
            ? allSectionIds
            : [],
  }));
  const inventory = makeInventory().map((item) => ({
    ...item,
    sectionId: item.sectionId ?? sectionForItem(item.name, item.type),
    sharedConsumable: item.sharedConsumable ?? false,
  }));
  const purchases = makePurchases();
  const supplierReturns = makeSupplierReturns();

  return {
    version: 4,
    settings,
    users,
    workers,
    checkIns: makeCheckIns(),
    jobCards,
    tasks,
    parts,
    inventory,
    suppliers: makeSuppliers(),
    purchases,
    supplierCreditNotes: makeSupplierCreditNotes(),
    customerCredits: makeCredits(),
    expenses: makeExpenses(),
    ledger: makeLedger(),
    marketing: makeMarketing(),
    notifications: makeNotifications(),
    appointments: makeAppointments(),
    estimates: makeEstimates(),
    advancePayments: makeAdvancePayments(),
    insuranceCompanies: makeInsuranceCompanies(),
    insuranceJobs: makeInsuranceClaims(),
    vehicleBills: makeVehicleBills(),
    attendance: makeAttendance(),
    staffLoans: makeStaffLoans(),
    payslips: makePayslips(),
    wagePayouts: makeWagePayouts(),
    serviceRecords: makeServiceRecords(jobCards, tasks, parts, workers),
    bankAccounts: makeBankAccounts(),
    bankTransactions: makeBankTransactions(),
    pettyCash: makePettyCash(),
    customerCheques: makeCustomerCheques(),
    supplierCheques: makeSupplierCheques(),
    creditPayments: makeCreditPayments(),
    supplierReturns,
    stockMovements: makeStockMovements(inventory, purchases, parts, supplierReturns),
    workshopLoans: makeWorkshopLoans(),
    workshopLoanPayments: makeWorkshopLoanPayments(),
    sections,
    openContainers: makeOpenContainers(),
    currentUserId: null,
  };
}

export function createEmptyState(settings: WorkshopSettings, owner: WorkshopUser): AppState {
  return {
    version: 4,
    settings,
    users: [owner],
    workers: [],
    checkIns: [],
    jobCards: [],
    tasks: [],
    parts: [],
    inventory: [],
    suppliers: [],
    purchases: [],
    supplierCreditNotes: [],
    customerCredits: [],
    expenses: [],
    ledger: [],
    marketing: [],
    notifications: [
      {
        id: uid("ntf"),
        departments: ["Owner", "PRO", "Supervisor", "Cashier", "Accounting", "Stores"],
        title: "Welcome to your workshop",
        message: "Finish the setup guide, add your team and inventory, then share the QR check-in link.",
        priority: "normal",
        createdAt: new Date().toISOString(),
        read: false,
        link: "/settings",
      },
    ],
    appointments: [],
    estimates: [],
    advancePayments: [],
    insuranceCompanies: makeInsuranceCompanies(),
    insuranceJobs: [],
    vehicleBills: [],
    attendance: [],
    staffLoans: [],
    payslips: [],
    wagePayouts: [],
    serviceRecords: [],
    bankAccounts: [],
    bankTransactions: [],
    pettyCash: [],
    customerCheques: [],
    supplierCheques: [],
    creditPayments: [],
    supplierReturns: [],
    stockMovements: [],
    workshopLoans: [],
    workshopLoanPayments: [],
    sections: [],
    openContainers: [],
    currentUserId: null,
  };
}
