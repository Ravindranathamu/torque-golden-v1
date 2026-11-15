import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Droplets,
  History,
  Package,
  PackageOpen,
  PackagePlus,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  Undo2,
} from "lucide-react";
import { useApp } from "../state/AppStore";
import { featureEnabled } from "../lib/features";
import {
  dateOnly,
  daysUntil,
  formatQty,
  isoDaysFrom,
  money,
  partIssueQty,
  shortDate,
  timeAgo,
  waLink,
} from "../lib/utils";
import {
  Alert,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  StatCard,
  StatusBadge,
  Tabs,
} from "../components/ui";
import { useToast } from "../components/Toast";
import type { PurchaseLine, StockType } from "../types";

type StoresTab = "requests" | "floor" | "inventory" | "suppliers" | "purchases";
type StockFilter = "all" | "low" | "out";

const emptyItem = {
  code: "",
  name: "",
  type: "Spare Part" as StockType,
  make: "",
  model: "",
  stock: "0",
  minStock: "1",
  unit: "pc",
  measureUnit: "pc",
  packSize: "",
  packLabel: "",
  sharedConsumable: false,
  sectionId: "",
  lastSellingPrice: "",
  lastCostPrice: "",
  supplierId: "",
};

interface PurchaseForm {
  supplierId: string;
  invoiceNo: string;
  type: "Cash" | "Credit";
  creditDays: string;
  purchaseDate: string;
  description: string;
  lines: PurchaseLine[];
}

function newPurchaseLine(): PurchaseLine {
  return {
    id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    itemId: "",
    itemName: "",
    qty: 1,
    costPrice: 0,
    sellingPrice: 0,
  };
}

export function StoresPage() {
  const {
    state,
    currentUser,
    fulfillPart,
    approveExchange,
    approveReturn,
    completeWarrantyClaim,
    addInventoryItem,
    addSupplier,
    addBulkPurchase,
    addSupplierReturn,
    openConsumableContainer,
    issueConsumable,
    markContainerEmpty,
  } = useApp();
  const { push } = useToast();
  const [tab, setTab] = useState<StoresTab>("requests");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [floorItemOpen, setFloorItemOpen] = useState(false);
  const [floorForm, setFloorForm] = useState({
    itemId: "",
    sectionId: "",
    label: "",
    qty: "",
    costPerUnit: "",
    sellingPerUnit: "",
  });
  const [issueContainerId, setIssueContainerId] = useState<string | null>(null);
  const [issueJobId, setIssueJobId] = useState("");
  const [issueQty, setIssueQty] = useState("");
  const [issueIncluded, setIssueIncluded] = useState(false);
  const [fulfillTargetId, setFulfillTargetId] = useState<string | null>(null);
  const [fulfillQty, setFulfillQty] = useState("1");
  const [fulfillCost, setFulfillCost] = useState("");
  const [fulfillMargin, setFulfillMargin] = useState("20");
  const [fulfillSupplier, setFulfillSupplier] = useState("");
  const [fulfillInvoice, setFulfillInvoice] = useState("");
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const [swapCost, setSwapCost] = useState("");
  const [swapMargin, setSwapMargin] = useState("20");
  const [swapSupplier, setSwapSupplier] = useState("");
  const [warrantyTargetId, setWarrantyTargetId] = useState<string | null>(null);
  const [warrantyCreditNote, setWarrantyCreditNote] = useState("");
  const [warrantyAmount, setWarrantyAmount] = useState("");
  const [returnTargetId, setReturnTargetId] = useState<string | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ ...emptyItem });
  const [stockCardId, setStockCardId] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [supplierReturnForm, setSupplierReturnForm] = useState({
    supplierId: "",
    purchaseId: "",
    invoiceNo: "",
    reason: "",
    lines: [{ itemId: "", qty: "1", costPrice: "" }],
  });
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", contactPerson: "" });
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>({
    supplierId: "",
    invoiceNo: "",
    type: "Credit",
    creditDays: "30",
    purchaseDate: dateOnly(new Date().toISOString()),
    description: "",
    lines: [newPurchaseLine()],
  });
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | StockType>("all");

  const sectionsEnabled =
    featureEnabled(state.settings, "enable_multi_sections") && state.sections.length > 0;
  const owner = Boolean(currentUser?.isOwner);
  const mySectionIds = currentUser?.sectionIds ?? [];
  const scopedSections = state.sections.filter(
    (section) =>
      section.active &&
      (owner || mySectionIds.length === 0 || mySectionIds.includes(section.id)),
  );
  const scopeSectionIds =
    sectionsEnabled && !owner && mySectionIds.length > 0 ? new Set(mySectionIds) : null;

  function inSectionScope(sectionId?: string): boolean {
    if (!sectionsEnabled) return true;
    if (scopeSectionIds && (!sectionId || !scopeSectionIds.has(sectionId))) return false;
    if (sectionFilter !== "all" && sectionId !== sectionFilter) return false;
    return true;
  }

  function matchesPartSection(part: { jobCardId: string; sectionId?: string }): boolean {
    if (!sectionsEnabled) return true;
    const fallback = state.jobCards.find((job) => job.id === part.jobCardId)?.sectionIds?.[0];
    return inSectionScope(part.sectionId ?? fallback);
  }

  const openContainers = state.openContainers
    .filter((container) => inSectionScope(container.sectionId))
    .sort((a, b) => {
      if (a.status === b.status) return b.openedAt.localeCompare(a.openedAt);
      return a.status === "Open" ? -1 : 1;
    });
  const openContainer = state.openContainers.find((entry) => entry.id === issueContainerId) ?? null;

  const issueRequests = state.parts
    .filter((part) => ["Requested", "Backordered"].includes(part.status))
    .filter((part) => matchesPartSection(part))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const swapRequests = state.parts
    .filter((part) => ["Exchange Pending", "Return Pending"].includes(part.status))
    .filter((part) => matchesPartSection(part))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const warrantyClaims = state.parts
    .filter((part) => part.warrantyStatus === "Claimed")
    .filter((part) => matchesPartSection(part))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const lowStock = state.inventory.filter((item) => item.stock < item.minStock);
  const outOfStock = state.inventory.filter((item) => item.stock <= 0);
  const stockValue = state.inventory.reduce(
    (sum, item) => sum + item.stock * (item.lastSellingPrice ?? 0),
    0,
  );
  const unpaidSupplier = state.purchases.filter(
    (purchase) => purchase.type === "Credit" && purchase.status === "Unpaid",
  );
  const supplierDueSoon = unpaidSupplier.filter(
    (purchase) => purchase.dueDate && daysUntil(purchase.dueDate) <= 7,
  );

  const visibleInventory = state.inventory
    .filter((item) => inSectionScope(item.sectionId))
    .filter((item) => {
      if (stockFilter === "low" && item.stock >= item.minStock) return false;
      if (stockFilter === "out" && item.stock > 0) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      const needle = search.trim().toLowerCase();
      if (!needle) return true;
      return `${item.name} ${item.code} ${item.make ?? ""} ${item.model ?? ""}`
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => {
      const aLow = a.stock < a.minStock ? 0 : 1;
      const bLow = b.stock < b.minStock ? 0 : 1;
      if (aLow !== bLow) return aLow - bLow;
      return a.name.localeCompare(b.name);
    });

  const fulfillPartRecord = state.parts.find((part) => part.id === fulfillTargetId) ?? null;
  const fulfillItem = state.inventory.find((item) => item.id === fulfillPartRecord?.itemId) ?? null;
  const fulfillJob = state.jobCards.find((job) => job.id === fulfillPartRecord?.jobCardId) ?? null;
  const swapPartRecord = state.parts.find((part) => part.id === swapTargetId) ?? null;
  const swapJob = state.jobCards.find((job) => job.id === swapPartRecord?.jobCardId) ?? null;
  const returnPartRecord = state.parts.find((part) => part.id === returnTargetId) ?? null;
  const returnJob = state.jobCards.find((job) => job.id === returnPartRecord?.jobCardId) ?? null;
  const warrantyPartRecord = state.parts.find((part) => part.id === warrantyTargetId) ?? null;
  const warrantyJob = state.jobCards.find((job) => job.id === warrantyPartRecord?.jobCardId) ?? null;
  const stockCardItem = state.inventory.find((item) => item.id === stockCardId) ?? null;
  const stockCardMovements = stockCardItem
    ? state.stockMovements
        .filter((movement) => movement.itemId === stockCardItem.id)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  const fulfillQtyNumber = Math.max(0.001, Number(fulfillQty) || 0.001);
  const fulfillSelling =
    Math.round((Number(fulfillCost) || 0) * (1 + (Number(fulfillMargin) || 0) / 100) * 100) / 100;
  const fulfillUnit = fulfillItem?.measureUnit ?? fulfillItem?.unit ?? "pc";
  const fulfillRequested = fulfillPartRecord
    ? Math.max(0, fulfillPartRecord.qtyRequested - fulfillPartRecord.qtyIssued) ||
      fulfillPartRecord.qtyRequested
    : 0;
  const fulfillMaxQty = Math.max(0.001, fulfillRequested);
  const fulfillStock = Math.max(0, fulfillItem?.stock ?? 0);
  const fulfillShortfall = Math.max(
    0,
    Math.round((fulfillQtyNumber - fulfillStock) * 1000) / 1000,
  );
  const fulfillNeedsPurchase = fulfillShortfall > 0.0001;
  const fulfillSupplierRecord = state.suppliers.find(
    (supplier) => supplier.id === fulfillSupplier,
  );
  const swapSelling =
    Math.round((Number(swapCost) || 0) * (1 + (Number(swapMargin) || 0) / 100) * 100) / 100;

  function unitCostOf(item: { type: StockType; packSize?: number; lastCostPrice?: number; lastSellingPrice?: number }): number {
    if (item.type === "Consumable" && item.packSize) {
      if (item.lastCostPrice) return item.lastCostPrice / item.packSize;
      return (item.lastSellingPrice ?? 0) / 1.2 / item.packSize;
    }
    return Math.round((item.lastSellingPrice ?? 0) / 1.2);
  }

  function openFulfill(partId: string) {
    const part = state.parts.find((entry) => entry.id === partId);
    const item = state.inventory.find((entry) => entry.id === part?.itemId);
    if (!part || !item) return;
    const remaining = Math.max(0, part.qtyRequested - part.qtyIssued);
    setFulfillTargetId(partId);
    setFulfillQty(String(remaining > 0 ? remaining : part.qtyRequested));
    setFulfillCost(String(unitCostOf(item)));
    setFulfillMargin("20");
    setFulfillSupplier(part.supplierId ?? item.supplierId ?? "");
    setFulfillInvoice(part.supplierInvoiceNo ?? "");
  }

  function saveFulfill() {
    if (!fulfillPartRecord || !fulfillItem) return;
    const qty = Number(fulfillQty);
    const cost = Number(fulfillCost);
    const margin = Number(fulfillMargin);
    if (!Number.isFinite(qty) || qty <= 0) {
      push("Enter a valid issue quantity.", "error");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      push("Enter the supplier cost price.", "error");
      return;
    }
    if (!Number.isFinite(margin) || margin < 0) {
      push("Enter a valid margin percentage.", "error");
      return;
    }
    if (fulfillNeedsPurchase && !fulfillInvoice.trim()) {
      push("Stock is short. Record the supplier purchase invoice number for the purchased quantity.", "error");
      return;
    }
    if (fulfillNeedsPurchase && !fulfillSupplier) {
      push("Choose the supplier for the purchased quantity.", "error");
      return;
    }
    const result = fulfillPart(fulfillPartRecord.id, {
      qtyIssued: qty,
      costPrice: cost,
      marginPercent: margin,
      supplierId: fulfillSupplier || undefined,
      supplierInvoiceNo: fulfillInvoice.trim(),
    });
    if (!result.ok) {
      push(result.message ?? "Could not issue this part.", "error");
      return;
    }
    push(`${qty} × ${fulfillItem.name} issued to ${fulfillJob?.vehicleNo ?? "the job"}.`);
    setFulfillTargetId(null);
  }

  function openSwap(partId: string) {
    const part = state.parts.find((entry) => entry.id === partId);
    if (!part) return;
    setSwapTargetId(partId);
    setSwapCost(String(part.costPrice || Math.round(part.sellingPrice / 1.2)));
    setSwapMargin(String(part.marginPercent || 20));
    setSwapSupplier(part.supplierId ?? "");
  }

  function saveSwap() {
    if (!swapPartRecord) return;
    const cost = Number(swapCost);
    const margin = Number(swapMargin);
    if (!Number.isFinite(cost) || cost < 0) {
      push("Enter the new cost price.", "error");
      return;
    }
    const result = approveExchange(swapPartRecord.id, {
      costPrice: cost,
      marginPercent: Number.isFinite(margin) ? margin : 20,
      supplierId: swapSupplier || undefined,
      supplierInvoiceNo: swapPartRecord.supplierInvoiceNo ?? "",
    });
    if (!result.ok) {
      push(result.message ?? "Could not complete the exchange.", "error");
      return;
    }
    push("Swap completed. The job invoice now reflects the new cost and price.");
    setSwapTargetId(null);
  }

  function confirmReturn() {
    if (!returnPartRecord) return;
    approveReturn(returnPartRecord.id);
    push("Return approved and stock restored.");
    setReturnTargetId(null);
  }

  function openWarranty(partId: string) {
    const part = state.parts.find((entry) => entry.id === partId);
    if (!part) return;
    setWarrantyTargetId(partId);
    setWarrantyCreditNote(part.creditNoteNo ?? "");
    setWarrantyAmount(part.creditNoteAmount ? String(part.creditNoteAmount) : "");
  }

  function saveWarranty() {
    if (!warrantyPartRecord) return;
    const amount = Number(warrantyAmount) || 0;
    if (amount > 0 && !warrantyCreditNote.trim()) {
      push("Enter the supplier credit note number for the credit amount.", "error");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      push("Enter a valid credit note amount.", "error");
      return;
    }
    const result = completeWarrantyClaim(warrantyPartRecord.id, {
      replacementInvoiceNo: warrantyPartRecord.supplierInvoiceNo ?? "",
      creditNoteNo: warrantyCreditNote.trim(),
      creditNoteAmount: amount,
    });
    if (!result.ok) {
      push(result.message ?? "Could not complete this warranty claim.", "error");
      return;
    }
    push(
      amount > 0
        ? `Warranty claim closed with credit note ${warrantyCreditNote.trim()}.`
        : "Warranty claim closed with a supplier replacement.",
    );
    setWarrantyTargetId(null);
  }

  function saveItem() {
    if (!itemForm.name.trim() || !itemForm.code.trim()) {
      push("Item name and code are required.", "error");
      return;
    }
    const stock = Number(itemForm.stock);
    const minStock = Number(itemForm.minStock);
    if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(minStock) || minStock < 0) {
      push("Stock and minimum levels must be zero or more.", "error");
      return;
    }
    addInventoryItem({
      code: itemForm.code.trim().toUpperCase(),
      name: itemForm.name.trim(),
      type: itemForm.type,
      make: itemForm.make.trim() || undefined,
      model: itemForm.model.trim() || undefined,
      stock,
      minStock,
      unit: itemForm.unit.trim() || "pc",
      measureUnit: itemForm.measureUnit.trim() || undefined,
      packSize: Number(itemForm.packSize) || undefined,
      packLabel: itemForm.packLabel.trim() || undefined,
      sharedConsumable: itemForm.type === "Consumable" ? itemForm.sharedConsumable : false,
      sectionId: itemForm.sectionId || undefined,
      lastCostPrice: Number(itemForm.lastCostPrice) || undefined,
      lastSellingPrice: Number(itemForm.lastSellingPrice) || undefined,
      supplierId: itemForm.supplierId || undefined,
    });
    push("Inventory item added.");
    setItemOpen(false);
    setItemForm({ ...emptyItem });
  }

  function saveSupplier() {
    if (!supplierForm.name.trim() || !supplierForm.phone.trim()) {
      push("Supplier name and phone are required.", "error");
      return;
    }
    addSupplier(supplierForm.name.trim(), supplierForm.phone.trim(), supplierForm.contactPerson.trim());
    push("Supplier added.");
    setSupplierOpen(false);
    setSupplierForm({ name: "", phone: "", contactPerson: "" });
  }

  function openPurchase(supplierId = "") {
    setPurchaseForm({
      supplierId,
      invoiceNo: "",
      type: "Credit",
      creditDays: "30",
      purchaseDate: dateOnly(new Date().toISOString()),
      description: "",
      lines: [newPurchaseLine()],
    });
    setPurchaseOpen(true);
  }

  function updatePurchaseLine(id: string, patch: Partial<PurchaseLine>) {
    setPurchaseForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }));
  }

  function choosePurchaseItem(id: string, itemId: string) {
    const item = state.inventory.find((entry) => entry.id === itemId);
    updatePurchaseLine(id, {
      itemId,
      itemName: item?.name ?? "",
      costPrice: item?.lastSellingPrice ? Math.round(item.lastSellingPrice / 1.2) : 0,
      sellingPrice: item?.lastSellingPrice ?? 0,
    });
  }

  const purchaseTotal = purchaseForm.lines.reduce(
    (sum, line) => sum + (Number(line.qty) || 0) * (Number(line.costPrice) || 0),
    0,
  );

  function savePurchase() {
    if (!purchaseForm.supplierId) {
      push("Choose a supplier.", "error");
      return;
    }
    if (!purchaseForm.invoiceNo.trim()) {
      push("Enter the supplier invoice number.", "error");
      return;
    }
    const lines = purchaseForm.lines.filter(
      (line) => line.itemId && Number(line.qty) > 0,
    );
    if (lines.length === 0) {
      push("Add at least one part row with a quantity.", "error");
      return;
    }
    const creditDays = Math.max(0, Number(purchaseForm.creditDays) || 0);
    const result = addBulkPurchase({
      supplierId: purchaseForm.supplierId,
      invoiceNo: purchaseForm.invoiceNo.trim(),
      type: purchaseForm.type,
      creditDays: purchaseForm.type === "Credit" ? creditDays || 30 : 0,
      purchaseDate: purchaseForm.purchaseDate,
      lines: lines.map((line) => ({
        ...line,
        qty: Number(line.qty),
        costPrice: Number(line.costPrice) || 0,
        sellingPrice: Number(line.sellingPrice) || undefined,
      })),
      description: purchaseForm.description.trim(),
    });
    if (!result.ok) {
      push(result.message ?? "Could not save the purchase.", "error");
      return;
    }
    push(
      purchaseForm.type === "Credit"
        ? "Bulk purchase recorded. Stock updated and supplier credit tracked."
        : "Bulk purchase recorded. Stock updated — accounting will settle the invoice.",
    );
    setPurchaseOpen(false);
  }

  function openSupplierReturn() {
    setSupplierReturnForm({
      supplierId: "",
      purchaseId: "",
      invoiceNo: "",
      reason: "",
      lines: [{ itemId: "", qty: "1", costPrice: "" }],
    });
    setReturnOpen(true);
  }

  function updateReturnLine(index: number, patch: Partial<{ itemId: string; qty: string; costPrice: string }>) {
    setSupplierReturnForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  }

  function saveSupplierReturn() {
    if (!supplierReturnForm.supplierId) {
      push("Choose the supplier.", "error");
      return;
    }
    if (!supplierReturnForm.invoiceNo.trim()) {
      push("Enter the supplier invoice number for this return.", "error");
      return;
    }
    const lines = supplierReturnForm.lines.filter(
      (line) => line.itemId && Number(line.qty) > 0,
    );
    if (lines.length === 0) {
      push("Add at least one part and quantity to return.", "error");
      return;
    }
    const result = addSupplierReturn({
      supplierId: supplierReturnForm.supplierId,
      purchaseId: supplierReturnForm.purchaseId || undefined,
      invoiceNo: supplierReturnForm.invoiceNo.trim(),
      reason: supplierReturnForm.reason.trim() || "Supplier return",
      lines: lines.map((line) => ({
        itemId: line.itemId,
        qty: Number(line.qty),
        costPrice: Number(line.costPrice) || 0,
      })),
    });
    if (!result.ok) {
      push(result.message ?? "Could not record the supplier return.", "error");
      return;
    }
    push("Supplier return recorded. Stock deducted and supplier account credited.");
    setReturnOpen(false);
  }

  function saveFloorContainer() {
    if (!floorForm.itemId) {
      push("Choose a consumable item.", "error");
      return;
    }
    const item = state.inventory.find((entry) => entry.id === floorForm.itemId);
    if (!item) {
      push("Inventory item not found.", "error");
      return;
    }
    const qty = Number(floorForm.qty) || item.packSize || 0;
    if (qty <= 0) {
      push("Enter the container quantity.", "error");
      return;
    }
    const result = openConsumableContainer({
      itemId: floorForm.itemId,
      sectionId: floorForm.sectionId || undefined,
      label: floorForm.label.trim() || undefined,
      qty,
      costPerUnit: Number(floorForm.costPerUnit) || undefined,
      sellingPricePerUnit: Number(floorForm.sellingPerUnit) || undefined,
    });
    if (!result.ok) {
      push(result.message ?? "Could not open the container.", "error");
      return;
    }
    push(`${item.name} opened on the shop floor with ${formatQty(qty, item.measureUnit ?? item.unit)}.`);
    setFloorItemOpen(false);
  }

  function saveContainerIssue() {
    if (!openContainer) return;
    if (!issueJobId) {
      push("Choose the job card receiving this consumable.", "error");
      return;
    }
    const qty = Number(issueQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      push("Enter a measured quantity greater than zero.", "error");
      return;
    }
    const job = state.jobCards.find((entry) => entry.id === issueJobId);
    const result = issueConsumable({
      jobCardId: issueJobId,
      containerId: openContainer.id,
      qty,
      includedInLabor: issueIncluded,
      sectionId: openContainer.sectionId ?? job?.sectionIds?.[0],
    });
    if (!result.ok) {
      push(result.message ?? "Could not issue this consumable.", "error");
      return;
    }
    push(
      `${formatQty(qty, openContainer.unit)} of ${openContainer.itemName} issued to ${job?.vehicleNo ?? issueJobId}${issueIncluded ? " · included in labor" : ""}.`,
    );
    setIssueContainerId(null);
    setIssueIncluded(false);
    setIssueQty("");
    setIssueJobId("");
  }

  const requestTabs = [
    { id: "requests" as StoresTab, label: "Requests", count: issueRequests.length + swapRequests.length },
    { id: "floor" as StoresTab, label: "Open floor", count: openContainers.filter((entry) => entry.status === "Open").length },
    { id: "inventory" as StoresTab, label: "Inventory", count: state.inventory.length },
    { id: "suppliers" as StoresTab, label: "Suppliers", count: state.suppliers.length },
    { id: "purchases" as StoresTab, label: "Purchases", count: state.purchases.length },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Stores & inventory"
        subtitle="Parts requests, open-floor consumables, vehicle-fitment stock, supplier credit and exchanges — with strict in-stock enforcement."
        actions={
          <>
            <Tabs<StoresTab> value={tab} onChange={setTab} tabs={requestTabs} />
            {sectionsEnabled && (
              <select
                className="select"
                style={{ width: 160 }}
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
              >
                <option value="all">All sections</option>
                {scopedSections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            )}
            {tab === "floor" && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setFloorForm({
                    itemId: "",
                    sectionId: sectionFilter === "all" ? "" : sectionFilter,
                    label: "",
                    qty: "",
                    costPerUnit: "",
                    sellingPerUnit: "",
                  });
                  setFloorItemOpen(true);
                }}
              >
                <PackageOpen />
                Open container
              </button>
            )}
            {tab === "inventory" && (
              <button className="btn btn-primary" onClick={() => setItemOpen(true)}>
                <PackagePlus />
                Add item
              </button>
            )}
            {tab === "suppliers" && (
              <button className="btn btn-primary" onClick={() => setSupplierOpen(true)}>
                <Plus />
                Add supplier
              </button>
            )}
            {tab === "purchases" && (
              <>
                <button className="btn btn-secondary" onClick={openSupplierReturn}>
                  <Undo2 />
                  Supplier return
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => openPurchase()}
                  disabled={state.suppliers.length === 0}
                >
                  <ShoppingCart />
                  Bulk purchase
                </button>
              </>
            )}
          </>
        }
      />

      <div className="grid cols-4">
        <StatCard
          label="Open parts requests"
          value={issueRequests.length}
          meta={`${swapRequests.length} exchange/return action${swapRequests.length === 1 ? "" : "s"}`}
          icon={<Package />}
          tone={issueRequests.length ? "amber" : "brand"}
        />
        <StatCard
          label="Low stock"
          value={lowStock.length}
          meta={`${outOfStock.length} item${outOfStock.length === 1 ? "" : "s"} completely out`}
          icon={<AlertTriangle />}
          tone={lowStock.length ? "red" : "brand"}
          negative={lowStock.length > 0}
        />
        <StatCard
          label="Stock lines"
          value={state.inventory.length}
          meta="Spare parts & consumables"
          icon={<Store />}
          tone="blue"
        />
        <StatCard
          label="Stock value"
          value={money(stockValue)}
          meta="At last recorded selling prices"
          icon={<Banknote />}
        />
      </div>

      {lowStock.length > 0 && (
        <div className="alert alert-warn" style={{ marginTop: 18 }}>
          <AlertTriangle />
          <div>
            <strong>Low stock needs a supplier order</strong>
            {lowStock.slice(0, 4).map((item) => (
              <span key={item.id} style={{ marginRight: 12 }}>
                {item.name} ({item.stock}/{item.minStock} {item.unit})
              </span>
            ))}
            <Link to="/accounting" style={{ fontWeight: 700 }}>
              Review supplier payables →
            </Link>
          </div>
        </div>
      )}

      {tab === "requests" && (
        <div className="stack" style={{ marginTop: 18 }}>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Pending issue & backorders</h3>
                <p>Stores sets the cost, margin and final selling price when issuing.</p>
              </div>
              <span className="badge badge-amber">{issueRequests.length} open</span>
            </div>
            {issueRequests.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={22} />}
                title="No parts waiting"
                message="New supervisor requests appear here. Stock is checked again at issue, so the workshop cannot overdraw inventory."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Job / vehicle</th>
                      <th className="num">Requested</th>
                      <th className="num">In stock</th>
                      <th>Status</th>
                      <th>Requested</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {issueRequests.map((part) => {
                      const item = state.inventory.find((entry) => entry.id === part.itemId);
                      const job = state.jobCards.find((entry) => entry.id === part.jobCardId);
                      return (
                        <tr key={part.id}>
                          <td>
                            <div className="cell-main">{part.itemName}</div>
                            <div className="cell-sub">{item?.code ?? part.itemId} · {item?.make ? `${item.make} ${item.model}` : "Universal"}</div>
                            {sectionsEnabled && part.sectionId && (
                              <div className="tiny" style={{ color: state.sections.find((section) => section.id === part.sectionId)?.color }}>
                                {state.sections.find((section) => section.id === part.sectionId)?.name}
                              </div>
                            )}
                          </td>
                          <td>
                            <Link to={`/jobs/${part.jobCardId}`} className="cell-main">
                              {job?.vehicleNo ?? part.jobCardId}
                            </Link>
                            <div className="cell-sub">{job?.customerName} · {part.jobCardId}</div>
                          </td>
                          <td className="num">
                            {formatQty(
                              part.qtyRequested - part.qtyIssued > 0
                                ? part.qtyRequested - part.qtyIssued
                                : part.qtyRequested,
                              item?.measureUnit ?? item?.unit ?? "pc",
                            )}
                          </td>
                          <td className="num">
                            <span className={`badge ${(item?.stock ?? 0) > 0 ? "badge-green" : "badge-red"}`}>
                              {formatQty(item?.stock ?? 0, item?.measureUnit ?? item?.unit ?? "pc")}
                            </span>
                          </td>
                          <td>
                            <StatusBadge status={part.status} />
                            {part.includedInLabor && (
                              <div className="badge badge-slate" style={{ marginTop: 3 }}>
                                Included in labor
                              </div>
                            )}
                          </td>
                          <td className="tiny muted">{timeAgo(part.createdAt)}</td>
                          <td>
                            <button className="btn btn-soft btn-sm" onClick={() => openFulfill(part.id)}>
                              <Package />
                              Issue
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Exchanges & returns</h3>
                <p>Approve only after physically receiving the part back at the stores counter.</p>
              </div>
              <span className="badge badge-blue">{swapRequests.length} waiting</span>
            </div>
            {swapRequests.length === 0 ? (
              <EmptyState
                icon={<RefreshCcw size={22} />}
                title="No swaps or returns"
                message="Supervisor exchange and return requests appear here. Approving a return restores the issued quantity to stock."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Job</th>
                      <th>Type</th>
                      <th className="num">Qty issued</th>
                      <th className="num">Current price</th>
                      <th>Supplier</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {swapRequests.map((part) => {
                      const job = state.jobCards.find((entry) => entry.id === part.jobCardId);
                      const supplier = state.suppliers.find((entry) => entry.id === part.supplierId);
                      return (
                        <tr key={part.id}>
                          <td><div className="cell-main">{part.itemName}</div><div className="cell-sub">{part.id}</div></td>
                          <td>
                            <Link className="cell-main" to={`/jobs/${part.jobCardId}`}>{job?.vehicleNo ?? part.jobCardId}</Link>
                            <div className="cell-sub">{job?.customerName}</div>
                          </td>
                          <td><StatusBadge status={part.status} /></td>
                          <td className="num">{formatQty(partIssueQty(part))}</td>
                          <td className="num">{money(part.sellingPrice)}</td>
                          <td className="tiny">{supplier?.name ?? "—"}</td>
                          <td>
                            {part.status === "Exchange Pending" ? (
                              <button className="btn btn-soft btn-sm" onClick={() => openSwap(part.id)}>
                                <RefreshCcw />
                                Complete swap
                              </button>
                            ) : (
                              <button className="btn btn-soft btn-sm" onClick={() => setReturnTargetId(part.id)}>
                                <Undo2 />
                                Approve return
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Warranty claims</h3>
                <p>Defective parts raised by the supervisor, tracked by supplier invoice and credit note.</p>
              </div>
              <span className="badge badge-blue">{warrantyClaims.length} open</span>
            </div>
            {warrantyClaims.length === 0 ? (
              <EmptyState
                icon={<ShieldAlert size={22} />}
                title="No open warranty claims"
                message="When a supplied part fails, raise a warranty claim from the job card. It appears here for replacement or supplier credit note."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Job</th>
                      <th>Supplier invoice</th>
                      <th>Claim note</th>
                      <th>Raised</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {warrantyClaims.map((part) => {
                      const job = state.jobCards.find((entry) => entry.id === part.jobCardId);
                      const supplier = state.suppliers.find((entry) => entry.id === part.supplierId);
                      return (
                        <tr key={part.id}>
                          <td>
                            <div className="cell-main">{part.itemName}</div>
                            <div className="cell-sub">{supplier?.name ?? "Supplier not set"}</div>
                          </td>
                          <td>
                            <Link className="cell-main" to={`/jobs/${part.jobCardId}`}>
                              {job?.vehicleNo ?? part.jobCardId}
                            </Link>
                            <div className="cell-sub">{job?.customerName}</div>
                          </td>
                          <td className="tiny">{part.supplierInvoiceNo || "—"}</td>
                          <td className="tiny muted" style={{ maxWidth: 240 }}>{part.warrantyNote ?? "—"}</td>
                          <td className="tiny muted">{timeAgo(part.updatedAt)}</td>
                          <td>
                            <button className="btn btn-soft btn-sm" onClick={() => openWarranty(part.id)}>
                              <ShieldCheck />
                              Complete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "floor" && (
        <div className="stack" style={{ marginTop: 18 }}>
          <Alert tone="info" title="Shop-floor open containers">
            Employees issue measured quantities — ml, g or a fraction of a can — to a job card.
            Warehouse stock is deducted when the container is opened and the unused remainder is
            written off when it is marked empty. Tick <strong>Included in labor</strong> to keep the
            cost internal: the line is hidden from the customer invoice, thermal receipt and
            WhatsApp, but stays in the owner P&amp;L.
          </Alert>

          {openContainers.length === 0 ? (
            <EmptyState
              icon={<PackageOpen size={22} />}
              title="No open containers"
              message="Open a shared consumable from the Inventory tab or the button above, then issue measured quantities to jobs."
            />
          ) : (
            <div className="grid cols-2">
              {openContainers.map((container) => {
                const section = state.sections.find((entry) => entry.id === container.sectionId);
                const remainingPct = Math.max(
                  0,
                  Math.min(100, (container.remainingQty / Math.max(container.capacity, 0.001)) * 100),
                );
                const open = container.status === "Open";
                return (
                  <div className="card" key={container.id}>
                    <div className="card-head">
                      <div>
                        <h3>{container.label}</h3>
                        <p>
                          {container.itemName} · {shortDate(container.openedAt)}
                          {container.openedBy ? ` · ${container.openedBy}` : ""}
                        </p>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        {section && (
                          <span
                            className="chip"
                            style={{
                              borderColor: section.color,
                              color: section.color,
                              background: `${section.color}14`,
                            }}
                          >
                            {section.name}
                          </span>
                        )}
                        <span className={`badge ${open ? "badge-green" : "badge-slate"}`}>
                          {container.status}
                        </span>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="row-between">
                        <span className="tiny muted">
                          Remaining {formatQty(container.remainingQty, container.unit)} of{" "}
                          {formatQty(container.capacity, container.unit)}
                        </span>
                        <span className="tiny muted">
                          {money(container.sellingPricePerUnit)} / {container.unit}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 8,
                          borderRadius: 99,
                          background: "#e2e8f0",
                          overflow: "hidden",
                          margin: "8px 0 12px",
                        }}
                      >
                        <div
                          style={{
                            width: `${remainingPct}%`,
                            height: "100%",
                            background: remainingPct < 25 ? "#dc2626" : section?.color ?? "#0f766e",
                          }}
                        />
                      </div>
                      {container.issues.length > 0 ? (
                        <div className="table-wrap">
                          <table className="data">
                            <thead>
                              <tr>
                                <th>Job</th>
                                <th className="num">Issued</th>
                                <th>When</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...container.issues]
                                .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
                                .slice(0, 4)
                                .map((issue) => {
                                  const job = state.jobCards.find((entry) => entry.id === issue.jobCardId);
                                  const part = state.parts.find((entry) => entry.id === issue.partId);
                                  return (
                                    <tr key={issue.id}>
                                      <td>
                                        <Link className="cell-main" to={`/jobs/${issue.jobCardId}`}>
                                          {job?.vehicleNo ?? issue.jobCardId}
                                        </Link>
                                        {part?.includedInLabor && (
                                          <div className="cell-sub">Included in labor</div>
                                        )}
                                      </td>
                                      <td className="num">{formatQty(issue.qty, container.unit)}</td>
                                      <td className="tiny muted">{timeAgo(issue.issuedAt)}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="tiny muted" style={{ marginBottom: 10 }}>
                          Nothing issued from this container yet.
                        </div>
                      )}
                      {open && (
                        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                          <button
                            className="btn btn-soft btn-sm"
                            onClick={() => {
                              setIssueContainerId(container.id);
                              setIssueQty("");
                              setIssueJobId("");
                              setIssueIncluded(false);
                            }}
                          >
                            <Droplets />
                            Issue to job
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              const result = markContainerEmpty(container.id);
                              if (!result.ok) {
                                push(result.message ?? "Could not close the container.", "error");
                                return;
                              }
                              push(
                                `${container.label} marked empty. Remaining ${formatQty(container.remainingQty, container.unit)} written off.`,
                              );
                            }}
                          >
                            <Package />
                            Mark empty
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "inventory" && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head" style={{ paddingBottom: 14 }}>
            <div>
              <h3>Inventory & fitment</h3>
              <p>Parts are filtered by make/model when the supervisor requests them.</p>
            </div>
            <div className="row wrap">
              <div className="search-wrap">
                <div className="input-group" style={{ minWidth: 210 }}>
                  <span className="prefix"><Search size={14} /></span>
                  <input
                    className="input"
                    placeholder="Search name, code or model…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>
              <select
                className="select"
                style={{ width: 130 }}
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as "all" | StockType)}
              >
                <option value="all">All types</option>
                <option value="Spare Part">Spare parts</option>
                <option value="Consumable">Consumables</option>
              </select>
              <Tabs<StockFilter>
                value={stockFilter}
                onChange={setStockFilter}
                tabs={[
                  { id: "all", label: "All" },
                  { id: "low", label: "Low", count: lowStock.length },
                  { id: "out", label: "Out", count: outOfStock.length },
                ]}
              />
            </div>
          </div>
          <div className="table-wrap">
            {visibleInventory.length === 0 ? (
              <EmptyState
                icon={<Search size={22} />}
                title="No matching stock"
                message="Adjust the search or filters, or add a new inventory item with its vehicle fitment."
              />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Fitment</th>
                    <th>Type</th>
                    <th className="num">Stock</th>
                    <th className="num">Min</th>
                    <th className="num">Last price</th>
                    <th>Supplier</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleInventory.map((item) => {
                    const supplier = state.suppliers.find((entry) => entry.id === item.supplierId);
                    const low = item.stock < item.minStock;
                    return (
                      <tr key={item.id} style={low ? { background: "#fff8f1" } : undefined}>
                        <td>
                          <div className="cell-main">{item.name}</div>
                          <div className="cell-sub">{item.code}</div>
                          {item.packLabel && <div className="cell-sub">{item.packLabel}</div>}
                        </td>
                        <td className="small">{item.make ? `${item.make} ${item.model}` : "Universal"}</td>
                        <td>
                          <span className="chip">{item.type}</span>
                          {sectionsEnabled && item.sectionId && (
                            <div
                              className="tiny"
                              style={{
                                marginTop: 3,
                                color: state.sections.find((section) => section.id === item.sectionId)?.color,
                              }}
                            >
                              {state.sections.find((section) => section.id === item.sectionId)?.name}
                            </div>
                          )}
                        </td>
                        <td className="num">
                          <span className={`badge ${item.stock <= 0 ? "badge-red" : low ? "badge-amber" : "badge-green"}`}>
                            {formatQty(item.stock, item.measureUnit ?? item.unit)}
                          </span>
                        </td>
                        <td className="num">{formatQty(item.minStock, item.measureUnit ?? item.unit)}</td>
                        <td className="num">{item.lastSellingPrice ? money(item.lastSellingPrice) : "—"}</td>
                        <td className="tiny">{supplier?.name ?? "—"}</td>
                        <td>
                          <div className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                            {item.type === "Consumable" && item.sharedConsumable && (
                              <button
                                className="btn btn-soft btn-sm"
                                title="Open a shop-floor container"
                                onClick={() => {
                                  setFloorForm({
                                    itemId: item.id,
                                    sectionId: item.sectionId ?? "",
                                    label: "",
                                    qty: String(item.packSize ?? item.stock ?? 0),
                                    costPerUnit: String(
                                      item.packSize && item.lastCostPrice
                                        ? item.lastCostPrice / item.packSize
                                        : (item.lastSellingPrice ?? 0) / 1.2,
                                    ),
                                    sellingPerUnit: String(
                                      item.packSize && item.lastSellingPrice
                                        ? item.lastSellingPrice / item.packSize
                                        : item.lastSellingPrice ?? 0,
                                    ),
                                  });
                                  setFloorItemOpen(true);
                                }}
                              >
                                <Droplets />
                              </button>
                            )}
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Open stock card"
                              onClick={() => setStockCardId(item.id)}
                            >
                              <History />
                            </button>
                          </div>
                          <div className="cell-sub" style={{ textAlign: "right", marginTop: 2 }}>
                            {item.isOpeningStock ? "Opening set" : "Opening pending"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "suppliers" && (
        <div className="grid cols-3" style={{ marginTop: 18 }}>
          {state.suppliers.map((supplier) => {
            const unpaid = state.purchases.filter(
              (purchase) =>
                purchase.supplierId === supplier.id &&
                purchase.type === "Credit" &&
                purchase.status === "Unpaid",
            );
            return (
              <div className="card" key={supplier.id}>
                <div className="card-body">
                  <div className="row-between">
                    <div className="row" style={{ gap: 10 }}>
                      <span className="part-icon" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                        <Truck size={15} />
                      </span>
                      <div>
                        <div className="strong">{supplier.name}</div>
                        <div className="tiny muted">{supplier.contactPerson || "Contact not set"}</div>
                      </div>
                    </div>
                    <span className={`badge ${supplier.outstandingCredit > 0 ? "badge-amber" : "badge-green"}`}>
                      {supplier.outstandingCredit > 0 ? money(supplier.outstandingCredit) : "Clear"}
                    </span>
                  </div>
                  <div className="divider" />
                  <div className="kv"><span>Phone</span><span>{supplier.phone}</span></div>
                  <div className="kv"><span>Open credit invoices</span><span>{unpaid.length}</span></div>
                  <div className="kv"><span>Outstanding credit</span><span>{money(supplier.outstandingCredit)}</span></div>
                  <div className="row wrap" style={{ marginTop: 12 }}>
                    <a
                      className="btn btn-secondary btn-sm"
                      href={waLink(supplier.phone, `Hello ${supplier.name}, this is ${state.settings.companyName}. We would like to place a parts order.`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Phone />
                      WhatsApp
                    </a>
                    <button className="btn btn-soft btn-sm" onClick={() => openPurchase(supplier.id)}>
                      <ShoppingCart />
                      Record purchase
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {state.suppliers.length === 0 && (
            <div className="card span-3">
              <EmptyState
                icon={<Truck size={22} />}
                title="No suppliers yet"
                message="Add your parts suppliers so stock can be linked to purchasing and credit terms."
                action={<button className="btn btn-primary" onClick={() => setSupplierOpen(true)}>Add supplier</button>}
              />
            </div>
          )}
        </div>
      )}

      {tab === "purchases" && (
        <div className="stack" style={{ marginTop: 18 }}>
          {supplierDueSoon.length > 0 && (
            <Alert tone="warn" icon={<CalendarDays />} title="Supplier credit due soon">
              {supplierDueSoon.length} invoice{supplierDueSoon.length === 1 ? "" : "s"} worth{" "}
              {money(supplierDueSoon.reduce((sum, purchase) => sum + purchase.amount, 0))} due within 7 days.
              Pay from the accounts screen or settle here.
            </Alert>
          )}
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Supplier purchases</h3>
                <p>Cash and credit invoices, periods and payment status.</p>
              </div>
              <span className="badge badge-amber">{unpaidSupplier.length} unpaid credit</span>
            </div>
            {state.purchases.length === 0 ? (
              <EmptyState
                icon={<ShoppingCart size={22} />}
                title="No purchases recorded"
                message="Record supplier invoices to track cash purchases and credit due dates."
                action={
                  <button className="btn btn-primary" onClick={() => openPurchase()} disabled={state.suppliers.length === 0}>
                    Record purchase
                  </button>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Supplier</th>
                      <th>Description</th>
                      <th className="num">Amount</th>
                      <th>Terms</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...state.purchases]
                      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))
                      .map((purchase) => {
                        const supplier = state.suppliers.find((entry) => entry.id === purchase.supplierId);
                        const dueDays = purchase.dueDate ? daysUntil(purchase.dueDate) : null;
                        return (
                          <tr key={purchase.id}>
                            <td><div className="cell-main">{purchase.invoiceNo}</div><div className="cell-sub">{purchase.id} · {shortDate(purchase.purchaseDate)}</div></td>
                            <td className="small">{supplier?.name ?? "—"}</td>
                            <td className="small" style={{ maxWidth: 240 }}>{purchase.description}</td>
                            <td className="num strong">{money(purchase.amount)}</td>
                            <td><span className="chip">{purchase.type}{purchase.type === "Credit" ? ` · ${purchase.creditDays}d` : ""}</span></td>
                            <td>
                              {purchase.dueDate ? (
                                <div>
                                  <div className="small">{shortDate(purchase.dueDate)}</div>
                                  <div className={`cell-sub ${dueDays !== null && dueDays < 0 && purchase.status === "Unpaid" ? "overdue-text" : ""}`}>
                                    {purchase.status === "Paid"
                                      ? "Paid"
                                      : dueDays === null
                                        ? ""
                                        : dueDays < 0
                                          ? `Overdue ${Math.abs(dueDays)}d`
                                          : dueDays === 0
                                            ? "Due today"
                                            : `In ${dueDays}d`}
                                  </div>
                                </div>
                              ) : "—"}
                            </td>
                            <td><StatusBadge status={purchase.status} /></td>
                            <td>
                              <div className="tiny muted">
                                {purchase.goodsConfirmedBy
                                  ? `Goods: ${purchase.goodsConfirmedBy}`
                                  : "Goods not confirmed"}
                              </div>
                              {purchase.chequeId && (
                                <span className="badge badge-amber">PDC issued</span>
                              )}
                              {!purchase.chequeId && purchase.status === "Unpaid" && (
                                <div className="tiny muted">Accounting settles</div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3>Supplier returns</h3>
                <p>Parts returned to suppliers with quantities, cost and credit reference.</p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={openSupplierReturn}>
                <Undo2 />
                Record return
              </button>
            </div>
            {state.supplierReturns.length === 0 ? (
              <EmptyState
                icon={<Undo2 size={22} />}
                title="No supplier returns"
                message="Wrong parts, warranty rejects and over-supplied items can be returned here. Stock and supplier credit update together."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Return</th>
                      <th>Supplier</th>
                      <th>Lines</th>
                      <th className="num">Credit value</th>
                      <th>Reason</th>
                      <th>Recorded by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...state.supplierReturns]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((entry) => {
                        const supplier = state.suppliers.find((s) => s.id === entry.supplierId);
                        return (
                          <tr key={entry.id}>
                            <td>
                              <div className="cell-main">{entry.creditNoteNo ?? entry.invoiceNo}</div>
                              <div className="cell-sub">{entry.id} · {shortDate(entry.date)}</div>
                            </td>
                            <td className="small">{supplier?.name ?? "—"}</td>
                            <td className="tiny">
                              {entry.lines.map((line) => `${line.qty} × ${line.itemName}`).join(", ")}
                            </td>
                            <td className="num strong">{money(entry.total)}</td>
                            <td className="small" style={{ maxWidth: 260 }}>{entry.reason}</td>
                            <td className="tiny">{entry.createdBy ?? "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(fulfillPartRecord)}
        onClose={() => setFulfillTargetId(null)}
        title={fulfillNeedsPurchase ? "Purchase & issue part" : "Issue part from stock"}
        subtitle={
          fulfillPartRecord && fulfillJob
            ? `${fulfillJob.vehicleNo} · ${fulfillPartRecord.itemName}`
            : undefined
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setFulfillTargetId(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveFulfill}>
              <Package />
              {fulfillNeedsPurchase ? "Purchase & issue" : "Issue"}{" "}
              {formatQty(fulfillQtyNumber, fulfillUnit)}
            </button>
          </>
        }
      >
        {fulfillPartRecord && fulfillItem && (
          <div className="stack">
            <div className="grid cols-3">
              <div className="mini-stat card">
                <div className="label">Requested</div>
                <div className="value" style={{ fontSize: 15 }}>
                  {formatQty(fulfillRequested, fulfillUnit)}
                </div>
                <div className="meta">{fulfillPartRecord.status}</div>
              </div>
              <div className="mini-stat card">
                <div className="label">In stock</div>
                <div className="value" style={{ fontSize: 15 }}>
                  {formatQty(fulfillItem.stock, fulfillUnit)}
                </div>
                <div className="meta">
                  {fulfillNeedsPurchase
                    ? `Short ${formatQty(fulfillShortfall, fulfillUnit)}`
                    : "Available to issue"}
                </div>
              </div>
              <div className="mini-stat card">
                <div className="label">Selling price</div>
                <div className="value" style={{ fontSize: 15 }}>{money(fulfillSelling)}</div>
                <div className="meta">Cost + {fulfillMargin || 0}% margin</div>
              </div>
            </div>

            {fulfillNeedsPurchase && (
              <Alert tone="warn" title="Stock short — purchase the balance">
                {formatQty(fulfillShortfall, fulfillUnit)} is not in stock. This issue records a direct
                cash purchase{fulfillSupplierRecord ? ` from ${fulfillSupplierRecord.name}` : ""} and
                requires the supplier invoice number. The purchased quantity is added to stock and
                immediately issued to the job.
              </Alert>
            )}

            <div className="form-grid">
              <Field
                label="Issue quantity"
                required
                hint={`Measured issue — up to ${formatQty(fulfillRequested, fulfillUnit)}. Any shortage is purchased before issuing.`}
              >
                <input
                  className="input"
                  type="number"
                  min={0.001}
                  step="any"
                  max={fulfillMaxQty}
                  value={fulfillQty}
                  onChange={(event) => setFulfillQty(event.target.value)}
                />
              </Field>
              <Field label="Supplier cost (LKR)" required>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={fulfillCost}
                  onChange={(event) => setFulfillCost(event.target.value)}
                />
              </Field>
              <Field label="Margin %" required hint="Default is 20%, override per item.">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={fulfillMargin}
                  onChange={(event) => setFulfillMargin(event.target.value)}
                />
              </Field>
              <Field
                label="Supplier"
                required={fulfillNeedsPurchase}
                hint={
                  fulfillNeedsPurchase
                    ? "Required for the direct purchase."
                    : "Used for warranty traceability."
                }
              >
                <select className="select" value={fulfillSupplier} onChange={(event) => setFulfillSupplier(event.target.value)}>
                  <option value="">Not set</option>
                  {state.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </Field>
              {fulfillNeedsPurchase && (
                <Field
                  label="Supplier invoice no."
                  required
                  hint="Required for the purchased quantity. Recorded as a direct cash purchase."
                >
                  <input
                    className="input"
                    placeholder="HZL/26/1841"
                    value={fulfillInvoice}
                    onChange={(event) => setFulfillInvoice(event.target.value)}
                  />
                </Field>
              )}
            </div>

            {fulfillQtyNumber < fulfillRequested - 0.0001 && (
              <Alert tone="warn" title="Partial issue creates a backorder">
                The remaining {formatQty(fulfillRequested - fulfillQtyNumber, fulfillUnit)} will stay
                on a backordered line until stock arrives. The customer invoice only includes issued
                quantities.
              </Alert>
            )}

            <div className="alert alert-info">
              <Package />
              <div>
                Issuing deducts <strong>{formatQty(fulfillQtyNumber, fulfillUnit)}</strong> from stock
                and updates the last selling price to <strong>{money(fulfillSelling)}</strong>. The job
                line updates in place.
                {fulfillNeedsPurchase && (
                  <>
                    {" "}The shortfall of <strong>{formatQty(fulfillShortfall, fulfillUnit)}</strong>{" "}
                    is purchased first and recorded against the supplier invoice.
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(swapPartRecord)}
        onClose={() => setSwapTargetId(null)}
        title="Complete part exchange"
        subtitle={swapPartRecord ? `${swapPartRecord.itemName} · ${swapJob?.vehicleNo ?? swapPartRecord.jobCardId}` : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setSwapTargetId(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveSwap}>
              <RefreshCcw />
              Save swap
            </button>
          </>
        }
      >
        {swapPartRecord && (
          <div className="stack">
            <Alert tone="info" title="Same stock row, new supplier price">
              The replacement is recorded against the same job line. Enter the new cost and margin;
              the invoice total recalculates immediately.
            </Alert>
            <div className="form-grid">
              <Field label="New supplier cost (LKR)" required>
                <input className="input" type="number" min={0} value={swapCost} onChange={(event) => setSwapCost(event.target.value)} />
              </Field>
              <Field label="New margin %" required>
                <input className="input" type="number" min={0} value={swapMargin} onChange={(event) => setSwapMargin(event.target.value)} />
              </Field>
              <Field label="Supplier">
                <select className="select" value={swapSupplier} onChange={(event) => setSwapSupplier(event.target.value)}>
                  <option value="">Not set</option>
                  {state.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="New selling price">
                <input className="input" readOnly value={money(swapSelling)} />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(warrantyPartRecord)}
        onClose={() => setWarrantyTargetId(null)}
        title="Complete warranty claim"
        subtitle={
          warrantyPartRecord
            ? `${warrantyPartRecord.itemName} · ${warrantyJob?.vehicleNo ?? warrantyPartRecord.jobCardId}`
            : undefined
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setWarrantyTargetId(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveWarranty}>
              <ShieldCheck />
              Close claim
            </button>
          </>
        }
      >
        {warrantyPartRecord && (
          <div className="stack">
            <div className="kv">
              <span>Original supplier invoice</span>
              <span>{warrantyPartRecord.supplierInvoiceNo || "Not recorded"}</span>
            </div>
            <div className="kv">
              <span>Claim reason</span>
              <span className="tiny">{warrantyPartRecord.warrantyNote ?? "—"}</span>
            </div>
            <div className="form-grid">
              <Field label="Credit note no." hint="Required only when the supplier issues a credit.">
                <input
                  className="input"
                  placeholder="SCN-7002"
                  value={warrantyCreditNote}
                  onChange={(event) => setWarrantyCreditNote(event.target.value)}
                />
              </Field>
              <Field label="Credit amount (LKR)" hint="Leave zero for a straight replacement.">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={warrantyAmount}
                  onChange={(event) => setWarrantyAmount(event.target.value)}
                />
              </Field>
            </div>
            <Alert tone="info" title="Warranty traceability">
              The claim is closed against the supplier invoice. If a credit amount is entered, a
              supplier credit note is recorded and linked to this job for accounting.
            </Alert>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(returnPartRecord)}
        onClose={() => setReturnTargetId(null)}
        title="Approve part return"
        subtitle={returnPartRecord ? `${returnPartRecord.itemName} · ${returnJob?.vehicleNo ?? returnPartRecord.jobCardId}` : undefined}
        size="narrow"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setReturnTargetId(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={confirmReturn}>
              <Undo2 />
              Approve return
            </button>
          </>
        }
      >
        {returnPartRecord && (
          <div className="stack">
            <div className="kv"><span>Part</span><span>{returnPartRecord.itemName}</span></div>
            <div className="kv"><span>Quantity</span><span>{formatQty(partIssueQty(returnPartRecord))}</span></div>
            <div className="kv"><span>Current invoice value</span><span>{money(returnPartRecord.sellingPrice * partIssueQty(returnPartRecord))}</span></div>
            <Alert tone="warn" title="Confirm physical return">
              Approving adds {formatQty(partIssueQty(returnPartRecord))} back to stock and removes this
              line's value from the customer invoice.
            </Alert>
          </div>
        )}
      </Modal>

      <Modal
        open={itemOpen}
        onClose={() => setItemOpen(false)}
        title="Add inventory item"
        subtitle="Fitment controls which vehicles can request this part."
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setItemOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveItem}>
              <PackagePlus />
              Add to inventory
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Item name" required>
            <input className="input" placeholder="Front Brake Pad Set" value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} />
          </Field>
          <Field label="Item code" required>
            <input className="input" placeholder="HZ-VZ-BRK01" value={itemForm.code} onChange={(event) => setItemForm({ ...itemForm, code: event.target.value })} />
          </Field>
          <Field label="Type" required>
            <select className="select" value={itemForm.type} onChange={(event) => setItemForm({ ...itemForm, type: event.target.value as StockType })}>
              <option>Spare Part</option>
              <option>Consumable</option>
            </select>
          </Field>
          <Field label="Supplier">
            <select className="select" value={itemForm.supplierId} onChange={(event) => setItemForm({ ...itemForm, supplierId: event.target.value })}>
              <option value="">No preferred supplier</option>
              {state.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Vehicle make" hint="Leave blank for universal items.">
            <input className="input" placeholder="Honda" value={itemForm.make} onChange={(event) => setItemForm({ ...itemForm, make: event.target.value })} />
          </Field>
          <Field label="Vehicle model" hint="Part only appears for this model.">
            <input className="input" placeholder="Vezel" value={itemForm.model} onChange={(event) => setItemForm({ ...itemForm, model: event.target.value })} />
          </Field>
          <Field label="Opening stock" required>
            <input className="input" type="number" min={0} value={itemForm.stock} onChange={(event) => setItemForm({ ...itemForm, stock: event.target.value })} />
          </Field>
          <Field label="Minimum stock" required hint="Low-stock alerts trigger below this.">
            <input className="input" type="number" min={0} value={itemForm.minStock} onChange={(event) => setItemForm({ ...itemForm, minStock: event.target.value })} />
          </Field>
          <Field label="Unit">
            <input className="input" placeholder="pc / set / bottle" value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })} />
          </Field>
          {itemForm.type === "Consumable" && (
            <>
              <Field label="Measure unit" hint="Base unit used for fractional issues — ml, g or pc.">
                <input className="input" placeholder="ml" value={itemForm.measureUnit} onChange={(event) => setItemForm({ ...itemForm, measureUnit: event.target.value })} />
              </Field>
              <Field label="Pack size" hint="Base units in one sealed pack (e.g. 450 ml, 1000 g).">
                <input className="input" type="number" min={0} step="any" value={itemForm.packSize} onChange={(event) => setItemForm({ ...itemForm, packSize: event.target.value })} />
              </Field>
              <Field label="Pack label" full>
                <input className="input" placeholder="450 ml spray can" value={itemForm.packLabel} onChange={(event) => setItemForm({ ...itemForm, packLabel: event.target.value })} />
              </Field>
              <Field label="Shop-floor container">
                <label className="toggle-row" style={{ padding: "8px 10px" }}>
                  <span className="small">Share from an open container</span>
                  <input
                    type="checkbox"
                    checked={itemForm.sharedConsumable}
                    onChange={(event) =>
                      setItemForm({ ...itemForm, sharedConsumable: event.target.checked })
                    }
                  />
                </label>
              </Field>
            </>
          )}
          {sectionsEnabled && (
            <Field label="Default section">
              <select
                className="select"
                value={itemForm.sectionId}
                onChange={(event) => setItemForm({ ...itemForm, sectionId: event.target.value })}
              >
                <option value="">Unassigned / central store</option>
                {scopedSections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Last cost price (LKR)">
            <input className="input" type="number" min={0} value={itemForm.lastCostPrice} onChange={(event) => setItemForm({ ...itemForm, lastCostPrice: event.target.value })} />
          </Field>
          <Field label="Last selling price (LKR)">
            <input className="input" type="number" min={0} value={itemForm.lastSellingPrice} onChange={(event) => setItemForm({ ...itemForm, lastSellingPrice: event.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(stockCardItem)}
        onClose={() => setStockCardId(null)}
        title="Stock card"
        subtitle={stockCardItem ? `${stockCardItem.name} · ${stockCardItem.stock} ${stockCardItem.unit}(s) in stock` : undefined}
        size="wide"
        footer={
          <button className="btn btn-secondary" onClick={() => setStockCardId(null)}>
            Close
          </button>
        }
      >
        {stockCardItem && (
          <div className="stack">
            <Alert tone="info" title="Stock changes only through controlled documents">
              Opening stock, bulk purchases, job part issues and supplier returns are the only
              actions that move stock. Manual quantity edits are disabled so the stock card always
              reconciles with the ledger.
            </Alert>
            {stockCardMovements.length === 0 ? (
              <EmptyState
                icon={<History size={22} />}
                title="No stock movements yet"
                message="This item has no opening stock, purchase or issue history recorded."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th className="num">Qty</th>
                      <th>Reference</th>
                      <th>Note</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockCardMovements.map((movement) => (
                      <tr key={movement.id}>
                        <td className="small">{shortDate(movement.date)}</td>
                        <td><span className="chip">{movement.type.replaceAll("_", " ")}</span></td>
                        <td className={`num strong ${movement.qty < 0 ? "overdue-text" : ""}`}>
                          {movement.qty > 0 ? "+" : ""}{movement.qty}
                        </td>
                        <td className="small">{movement.reference}</td>
                        <td className="tiny">{movement.note ?? "—"}</td>
                        <td className="tiny">{movement.createdBy ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Record supplier return"
        subtitle="Returned parts reduce stock and credit the supplier account."
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setReturnOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveSupplierReturn}>
              <Undo2 />
              Save return
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Supplier" required>
              <select
                className="select"
                value={supplierReturnForm.supplierId}
                onChange={(event) => {
                  const supplierId = event.target.value;
                  setSupplierReturnForm((prev) => ({ ...prev, supplierId, purchaseId: "", invoiceNo: "" }));
                }}
              >
                <option value="">Choose supplier</option>
                {state.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Original purchase invoice" hint="Optional — links the return to a recorded purchase.">
              <select
                className="select"
                value={supplierReturnForm.purchaseId}
                onChange={(event) => {
                  const purchase = state.purchases.find((p) => p.id === event.target.value);
                  setSupplierReturnForm((prev) => ({
                    ...prev,
                    purchaseId: event.target.value,
                    invoiceNo: purchase?.invoiceNo ?? prev.invoiceNo,
                  }));
                }}
              >
                <option value="">Not linked</option>
                {state.purchases
                  .filter((purchase) => !supplierReturnForm.supplierId || purchase.supplierId === supplierReturnForm.supplierId)
                  .map((purchase) => (
                    <option key={purchase.id} value={purchase.id}>
                      {purchase.invoiceNo} · {purchase.id}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Supplier invoice number" required>
              <input
                className="input"
                value={supplierReturnForm.invoiceNo}
                onChange={(event) => setSupplierReturnForm({ ...supplierReturnForm, invoiceNo: event.target.value })}
              />
            </Field>
            <Field label="Reason" hint="Wrong model, damaged, warranty reject or over-supply.">
              <input
                className="input"
                value={supplierReturnForm.reason}
                onChange={(event) => setSupplierReturnForm({ ...supplierReturnForm, reason: event.target.value })}
              />
            </Field>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Part</th>
                  <th className="num">Qty</th>
                  <th className="num">Cost</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {supplierReturnForm.lines.map((line, index) => (
                  <tr key={index}>
                    <td>
                      <select
                        className="select"
                        value={line.itemId}
                        onChange={(event) => {
                          const item = state.inventory.find((entry) => entry.id === event.target.value);
                          updateReturnLine(index, {
                            itemId: event.target.value,
                            costPrice: item?.lastSellingPrice ? String(Math.round(item.lastSellingPrice / 1.2)) : "",
                          });
                        }}
                      >
                        <option value="">Choose part</option>
                        {state.inventory.map((item) => (
                          <option key={item.id} value={item.id}>{item.name} · {item.code}</option>
                        ))}
                      </select>
                    </td>
                    <td className="num">
                      <input
                        className="input"
                        type="number"
                        min={1}
                        style={{ width: 80 }}
                        value={line.qty}
                        onChange={(event) => updateReturnLine(index, { qty: event.target.value })}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="input"
                        type="number"
                        min={0}
                        style={{ width: 110 }}
                        value={line.costPrice}
                        onChange={(event) => updateReturnLine(index, { costPrice: event.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={supplierReturnForm.lines.length === 1}
                        onClick={() =>
                          setSupplierReturnForm((prev) => ({
                            ...prev,
                            lines: prev.lines.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() =>
              setSupplierReturnForm((prev) => ({
                ...prev,
                lines: [...prev.lines, { itemId: "", qty: "1", costPrice: "" }],
              }))
            }
          >
            <Plus />
            Add another part
          </button>
        </div>
      </Modal>

      <Modal
        open={supplierOpen}
        onClose={() => setSupplierOpen(false)}
        title="Add supplier"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setSupplierOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveSupplier}>
              <Plus />
              Add supplier
            </button>
          </>
        }
      >
        <div className="stack">
          <Field label="Supplier name" required>
            <input className="input" placeholder="Hybrid Zone Lanka" value={supplierForm.name} onChange={(event) => setSupplierForm({ ...supplierForm, name: event.target.value })} autoFocus />
          </Field>
          <div className="form-grid">
            <Field label="Phone" required>
              <input className="input" placeholder="+94 77 222 3344" value={supplierForm.phone} onChange={(event) => setSupplierForm({ ...supplierForm, phone: event.target.value })} />
            </Field>
            <Field label="Contact person">
              <input className="input" placeholder="Ashan" value={supplierForm.contactPerson} onChange={(event) => setSupplierForm({ ...supplierForm, contactPerson: event.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        title="Record bulk supplier purchase"
        subtitle="Multiple part rows on one supplier invoice. Stock updates on save; accounting settles the invoice."
        size="wide"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setPurchaseOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={savePurchase}>
              <ShoppingCart />
              Save purchase · {money(purchaseTotal)}
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Supplier" required>
              <select className="select" value={purchaseForm.supplierId} onChange={(event) => setPurchaseForm({ ...purchaseForm, supplierId: event.target.value })}>
                <option value="">Choose supplier</option>
                {state.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Supplier invoice number" required>
              <input className="input" placeholder="HZL/26/1841" value={purchaseForm.invoiceNo} onChange={(event) => setPurchaseForm({ ...purchaseForm, invoiceNo: event.target.value })} />
            </Field>
            <Field label="Purchase type" required>
              <select className="select" value={purchaseForm.type} onChange={(event) => setPurchaseForm({ ...purchaseForm, type: event.target.value as "Cash" | "Credit" })}>
                <option value="Cash">Cash — accounting settles</option>
                <option value="Credit">Credit — pay later</option>
              </select>
            </Field>
            <Field label="Purchase date" required>
              <input className="input" type="date" value={purchaseForm.purchaseDate} onChange={(event) => setPurchaseForm({ ...purchaseForm, purchaseDate: event.target.value })} />
            </Field>
            <Field label="Credit period (days)" hint="Only used for credit purchases.">
              <input className="input" type="number" min={0} value={purchaseForm.creditDays} onChange={(event) => setPurchaseForm({ ...purchaseForm, creditDays: event.target.value })} disabled={purchaseForm.type !== "Credit"} />
            </Field>
            <Field label="Description" full>
              <input className="input" placeholder="Vezel brake pads, filters and fluids" value={purchaseForm.description} onChange={(event) => setPurchaseForm({ ...purchaseForm, description: event.target.value })} />
            </Field>
          </div>

          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <strong className="small">Invoice lines</strong>
              <span className="badge badge-brand">{purchaseForm.lines.length} line{purchaseForm.lines.length === 1 ? "" : "s"}</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th className="num">Qty</th>
                    <th className="num">Cost</th>
                    <th className="num">Selling</th>
                    <th className="num">Line total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {purchaseForm.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <select
                          className="select"
                          value={line.itemId}
                          onChange={(event) => choosePurchaseItem(line.id, event.target.value)}
                        >
                          <option value="">Choose part</option>
                          {state.inventory.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} · {item.code}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="num">
                        <input
                          className="input"
                          type="number"
                          min={1}
                          style={{ width: 74 }}
                          value={line.qty}
                          onChange={(event) => updatePurchaseLine(line.id, { qty: Number(event.target.value) || 0 })}
                        />
                      </td>
                      <td className="num">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          style={{ width: 105 }}
                          value={line.costPrice}
                          onChange={(event) => updatePurchaseLine(line.id, { costPrice: Number(event.target.value) || 0 })}
                        />
                      </td>
                      <td className="num">
                        <input
                          className="input"
                          type="number"
                          min={0}
                          style={{ width: 105 }}
                          value={line.sellingPrice ?? 0}
                          onChange={(event) => updatePurchaseLine(line.id, { sellingPrice: Number(event.target.value) || 0 })}
                        />
                      </td>
                      <td className="num strong">{money((Number(line.qty) || 0) * (Number(line.costPrice) || 0))}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={purchaseForm.lines.length === 1}
                          onClick={() =>
                            setPurchaseForm((prev) => ({
                              ...prev,
                              lines: prev.lines.filter((entry) => entry.id !== line.id),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row-between" style={{ marginTop: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  setPurchaseForm((prev) => ({
                    ...prev,
                    lines: [...prev.lines, newPurchaseLine()],
                  }))
                }
              >
                <Plus />
                Add another part
              </button>
              <strong>Invoice total {money(purchaseTotal)}</strong>
            </div>
          </div>

          {purchaseForm.type === "Credit" && (
            <Alert tone="info">
              Due date will be{" "}
              <strong>
                {shortDate(
                  isoDaysFrom(
                    new Date(`${purchaseForm.purchaseDate}T12:00:00`).toISOString(),
                    Number(purchaseForm.creditDays) || 30,
                  ),
                )}
              </strong>{" "}
              — accounting will be alerted before it falls due.
            </Alert>
          )}
        </div>
      </Modal>

      <Modal
        open={floorItemOpen}
        onClose={() => setFloorItemOpen(false)}
        title="Open a shop-floor container"
        subtitle="Issue measured quantities from this container to jobs. Pack stock stays in the warehouse until opened."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setFloorItemOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveFloorContainer}>
              <PackageOpen />
              Open container
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="Consumable" required>
              <select
                className="select"
                value={floorForm.itemId}
                onChange={(event) => {
                  const item = state.inventory.find((entry) => entry.id === event.target.value);
                  setFloorForm((prev) => ({
                    ...prev,
                    itemId: event.target.value,
                    sectionId: prev.sectionId || item?.sectionId || "",
                    qty: String(item?.packSize ?? ""),
                    costPerUnit:
                      item?.packSize && item.lastCostPrice
                        ? String(item.lastCostPrice / item.packSize)
                        : String(item?.lastCostPrice ?? ""),
                    sellingPerUnit:
                      item?.packSize && item.lastSellingPrice
                        ? String(item.lastSellingPrice / item.packSize)
                        : String(item?.lastSellingPrice ?? ""),
                  }));
                }}
              >
                <option value="">Choose consumable…</option>
                {state.inventory
                  .filter((item) => item.type === "Consumable")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {formatQty(item.stock, item.measureUnit ?? item.unit)} in stock
                    </option>
                  ))}
              </select>
            </Field>
            {sectionsEnabled && (
              <Field label="Section">
                <select
                  className="select"
                  value={floorForm.sectionId}
                  onChange={(event) =>
                    setFloorForm({ ...floorForm, sectionId: event.target.value })
                  }
                >
                  <option value="">Unassigned</option>
                  {scopedSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Container label" full>
              <input
                className="input"
                placeholder="Carb cleaner · Mechanical bay"
                value={floorForm.label}
                onChange={(event) => setFloorForm({ ...floorForm, label: event.target.value })}
              />
            </Field>
            <Field label="Quantity in container" required hint="Usually one pack — 450 ml, 1 kg, 1 L.">
              <input
                className="input"
                type="number"
                min={0.001}
                step="any"
                value={floorForm.qty}
                onChange={(event) => setFloorForm({ ...floorForm, qty: event.target.value })}
              />
            </Field>
            <Field label="Cost per unit (LKR)" hint="Base unit cost — ml, g or piece.">
              <input
                className="input"
                type="number"
                min={0}
                step="any"
                value={floorForm.costPerUnit}
                onChange={(event) =>
                  setFloorForm({ ...floorForm, costPerUnit: event.target.value })
                }
              />
            </Field>
            <Field label="Selling price per unit (LKR)">
              <input
                className="input"
                type="number"
                min={0}
                step="any"
                value={floorForm.sellingPerUnit}
                onChange={(event) =>
                  setFloorForm({ ...floorForm, sellingPerUnit: event.target.value })
                }
              />
            </Field>
          </div>
          <Alert tone="info">
            Opening does not deduct warehouse stock yet. Each issue deducts the measured quantity,
            and marking the container empty writes off the unused residue.
          </Alert>
        </div>
      </Modal>

      <Modal
        open={Boolean(openContainer)}
        onClose={() => setIssueContainerId(null)}
        title="Issue from open container"
        subtitle={
          openContainer
            ? `${openContainer.label} · ${formatQty(openContainer.remainingQty, openContainer.unit)} remaining`
            : undefined
        }
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIssueContainerId(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveContainerIssue}>
              <Droplets />
              Issue measured quantity
            </button>
          </>
        }
      >
        {openContainer && (
          <div className="stack">
            <div className="grid cols-3">
              <div className="mini-stat card">
                <div className="label">Remaining</div>
                <div className="value" style={{ fontSize: 15 }}>
                  {formatQty(openContainer.remainingQty, openContainer.unit)}
                </div>
              </div>
              <div className="mini-stat card">
                <div className="label">Cost / unit</div>
                <div className="value" style={{ fontSize: 15 }}>
                  {money(openContainer.costPerUnit, 2)}
                </div>
              </div>
              <div className="mini-stat card">
                <div className="label">Selling / unit</div>
                <div className="value" style={{ fontSize: 15 }}>
                  {money(openContainer.sellingPricePerUnit, 2)}
                </div>
              </div>
            </div>
            <Field label="Job card" required>
              <select
                className="select"
                value={issueJobId}
                onChange={(event) => setIssueJobId(event.target.value)}
              >
                <option value="">Choose job…</option>
                {state.jobCards
                  .filter((job) => job.status !== "Dispatched")
                  .filter(
                    (job) =>
                      !openContainer.sectionId ||
                      !sectionsEnabled ||
                      (job.sectionIds ?? []).includes(openContainer.sectionId),
                  )
                  .map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.vehicleNo} · {job.customerName} · {job.id}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label={`Quantity to issue (${openContainer.unit})`}
              required
              hint="Fractional values are allowed — for example 250 ml from a 450 ml can."
            >
              <input
                className="input"
                type="number"
                min={0.001}
                step="any"
                max={openContainer.remainingQty}
                value={issueQty}
                onChange={(event) => setIssueQty(event.target.value)}
              />
            </Field>
            <div className="row wrap" style={{ gap: 6 }}>
              {[50, 100, 150, 250].map((value) => (
                <button
                  key={value}
                  className="btn btn-secondary btn-sm"
                  disabled={value > openContainer.remainingQty}
                  onClick={() => setIssueQty(String(value))}
                >
                  {formatQty(value, openContainer.unit)}
                </button>
              ))}
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setIssueQty(String(openContainer.remainingQty))}
              >
                All remaining
              </button>
            </div>
            <label className="toggle-row">
              <span>
                <strong>Included in labor</strong>
                <div className="tiny muted">
                  Hide this line from the customer invoice, thermal receipt and WhatsApp. The cost
                  still appears in the owner P&amp;L.
                </div>
              </span>
              <input
                type="checkbox"
                checked={issueIncluded}
                onChange={(event) => setIssueIncluded(event.target.checked)}
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
