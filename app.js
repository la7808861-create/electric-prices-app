function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const seedProducts = [
  {
    id: makeId(),
    name: "قاطع كهرباء شنايدر 32 أمبير",
    category: "قواطع",
    code: "BRK-SCH-32",
    aisle: "A1",
    supplier: "مخزن الرشيد",
    price: 18500,
    cost: 15200,
    stock: 42,
    minStock: 10,
    updatedAt: "اليوم 09:30",
    note: "أصلي، ضمان سنة",
    image: ""
  },
  {
    id: makeId(),
    name: "كيبل نحاس 2.5 ملم عراقي",
    category: "كيبلات",
    code: "CBL-CU-25",
    aisle: "B3",
    supplier: "شركة النور",
    price: 1150,
    cost: 930,
    stock: 620,
    minStock: 180,
    updatedAt: "اليوم 10:15",
    note: "السعر للمتر",
    image: ""
  },
  {
    id: makeId(),
    name: "مصباح LED بانل 18 واط",
    category: "إنارة",
    code: "LED-PNL-18",
    aisle: "C2",
    supplier: "ضياء بغداد",
    price: 6500,
    cost: 5100,
    stock: 8,
    minStock: 15,
    updatedAt: "أمس 18:20",
    note: "إضاءة بيضاء",
    image: ""
  },
  {
    id: makeId(),
    name: "فيشة ثلاثية مقاومة حرارة",
    category: "إكسسوارات",
    code: "ACC-PLG-3H",
    aisle: "D1",
    supplier: "مستورد عام",
    price: 2750,
    cost: 2100,
    stock: 95,
    minStock: 25,
    updatedAt: "أمس 13:05",
    note: "تغليف مفرد",
    image: ""
  }
];

const state = {
  role: localStorage.getItem("role") || "",
  currentUserName: localStorage.getItem("currentUserName") || "",
  view: "prices",
  products: [],
  activity: [
    "تم تحديث سعر كيبل نحاس 2.5 ملم بواسطة المدير",
    "تنبيه نقص مخزون: مصباح LED بانل 18 واط",
    "تمت إضافة مورد جديد: شركة النور"
  ],
  users: [],
  categories: ["قواطع", "كيبلات", "إنارة", "إكسسوارات", "مفاتيح", "أنابيب", "عدد"],
  query: "",
  category: "الكل",
  scannerStream: null,
  scannerTimer: null,
  scannerReader: null,
  pendingBarcode: ""
};
let zxingLoadPromise = null;

function categoriesList() {
  return ["الكل", ...state.categories];
}

function save() {
  localStorage.setItem("role", state.role);
  localStorage.setItem("currentUserName", state.currentUserName);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) throw new Error("API request failed");
  return response.json();
}

async function loadData({ silent = false } = {}) {
  try {
    const data = await api("/api/data");
    state.products = data.products || [];
    state.categories = data.categories || state.categories;
    state.activity = data.activity || state.activity;
    state.users = data.users || state.users;
    if (!silent) render();
  } catch (error) {
    if (!silent) {
      state.products = JSON.parse(localStorage.getItem("products") || "null") || seedProducts;
      render();
    }
  }
}

function money(value) {
  return Number(value || 0).toLocaleString("ar-IQ") + " د.ع";
}

function filteredProducts() {
  return state.products.filter((product) => {
    const text = `${product.name} ${product.code} ${product.supplier} ${product.aisle}`.toLowerCase();
    const matchesQuery = text.includes(state.query.trim().toLowerCase());
    const matchesCategory = state.category === "الكل" || product.category === state.category;
    return matchesQuery && matchesCategory;
  });
}

function loginScreen() {
  return `
    <main class="login">
      <section class="login-panel">
        <div class="brand-mark">⚡</div>
        <h1>دليل أسعار المجمع الكهربائي</h1>
        <p>تطبيق داخلي للمدير والعمال لمعرفة أسعار المواد، أماكنها، المخزون، وآخر تحديثات السعر بدون الرجوع للدفاتر.</p>
        <div class="field">
          <label>نوع المستخدم</label>
          <select class="select" id="loginRole">
            <option value="manager">مدير المجمع</option>
            <option value="worker">عامل / مبيعات</option>
          </select>
        </div>
        <div class="field">
          <label>رمز الدخول التجريبي</label>
          <input class="input" id="loginCode" value="1234" inputmode="numeric" />
        </div>
        <button class="btn" id="loginBtn">دخول التطبيق</button>
      </section>
    </main>
  `;
}

function shell() {
  const roleText = state.role === "manager" ? "مدير" : "عامل";
  return `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">⚡</div>
          <div>
            <h1>دليل أسعار<br><span>المجمع الكهربائي</span></h1>
            <p>بحث، أسعار، مخزون، ومتابعة تحديثات</p>
          </div>
        </div>
        <button class="role-pill" id="logout"><small>${roleText}</small><strong>${state.currentUserName || roleText}</strong></button>
      </header>
      <main class="content">${viewContent()}</main>
      <nav class="nav">
        ${navButton("prices", "الأسعار", "⌕")}
        ${navButton("stock", "المخزون", "▦")}
        ${state.role === "manager" ? navButton("admin", "إدارة", "▣") : ""}
        ${navButton("updates", "السجل", "↻")}
        ${navButton("settings", "إعدادات", "⚙")}
      </nav>
      <div id="modalRoot"></div>
    </div>
  `;
}

function navButton(view, label, icon) {
  return `<button class="${state.view === view ? "active" : ""}" data-view="${view}"><span>${icon}</span><span>${label}</span></button>`;
}

function viewContent() {
  if (state.view === "stock") return stockView();
  if (state.view === "admin" && state.role === "manager") return adminView();
  if (state.view === "updates") return updatesView();
  if (state.view === "settings") return settingsView();
  return pricesView();
}

function summaryStats() {
  const low = state.products.filter((p) => Number(p.stock) <= Number(p.minStock)).length;
  const totalValue = state.products.reduce((sum, p) => sum + Number(p.price) * Number(p.stock), 0);
  return `
    <section class="stats">
      <div class="stat"><strong>${state.products.length}</strong><span>مادة مسجلة</span></div>
      <div class="stat"><strong>${low}</strong><span>تنبيهات نقص</span></div>
      <div class="stat"><strong>${money(totalValue)}</strong><span>قيمة بيع تقريبية</span></div>
      <div class="stat"><strong>${state.categories.length}</strong><span>أقسام</span></div>
    </section>
  `;
}

function filters() {
  return `
    <section class="toolbar">
      <input class="input" id="search" placeholder="ابحث باسم المادة، الكود، المورد أو الرف" value="${state.query}" />
      <select class="select" id="category">
        ${categoriesList().map((cat) => `<option ${cat === state.category ? "selected" : ""}>${cat}</option>`).join("")}
      </select>
      <button class="btn secondary" id="scanCode">مسح كود</button>
      <button class="btn gold" id="showAdd">إضافة مادة</button>
    </section>
  `;
}

function pricesView() {
  return `
    ${summaryStats()}
    ${filters()}
    <section class="layout">
      <div>
        <div class="section-title"><h2>دليل المواد والأسعار</h2><span>${filteredProducts().length} نتيجة</span></div>
        <div class="product-list">${productCards()}</div>
      </div>
      <aside>
        ${productForm()}
        ${state.role === "manager" ? "" : workerPanel()}
        ${alertsPanel()}
      </aside>
    </section>
  `;
}

function productCards() {
  const products = filteredProducts();
  if (!products.length) return `<div class="empty">لا توجد مواد مطابقة للبحث الحالي</div>`;
  return products.map((product) => `
    <article class="product">
      <div class="product-photo">
        ${product.image ? `<img src="${product.image}" alt="${product.name}" />` : `<span>صورة</span>`}
      </div>
      <div>
        <h3>${product.name}</h3>
        <div class="meta">
          <span class="tag">${product.category}</span>
          <span class="tag">الكود: ${product.code}</span>
          <span class="tag">الرف: ${product.aisle}</span>
          <span class="tag">المخزون: ${product.stock}</span>
          <span class="tag">المورد: ${product.supplier}</span>
        </div>
        <p class="meta">${product.note || "لا توجد ملاحظات"}</p>
      </div>
      <div class="price">
        <strong>${money(product.price)}</strong>
        <small>آخر تحديث: ${product.updatedAt}</small>
        ${state.role === "manager" ? `<div class="actions"><button class="btn secondary" data-edit="${product.id}">تعديل</button><button class="btn danger" data-delete="${product.id}">حذف</button></div>` : ""}
      </div>
    </article>
  `).join("");
}

function productForm(product = null) {
  const p = product || { id: "", name: "", category: "قواطع", code: state.pendingBarcode || "", aisle: "", supplier: "", price: "", cost: "", stock: "", minStock: "", note: "", image: "" };
  return `
    <section class="panel" id="formPanel">
      <h2>${product ? "تعديل مادة" : "إضافة مادة جديدة"}</h2>
      <form id="productForm" class="form-grid">
        <input type="hidden" name="id" value="${p.id}" />
        <div class="field wide">
          <label>باركود المادة</label>
          <div class="barcode-box">
            <strong id="barcodeLabel">${p.code || "لم يتم مسح باركود بعد"}</strong>
            <button class="btn secondary" type="button" id="scanForAdd">مسح باركود</button>
          </div>
          <input type="hidden" name="code" id="barcodeValue" value="${p.code}" />
        </div>
        <div class="field wide"><label>اسم المادة</label><input class="input" name="name" id="productName" required value="${p.name}" /></div>
        <div class="field"><label>القسم</label><select class="select" name="category">${state.categories.map(c => `<option ${c === p.category ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        <div class="field"><label>سعر البيع</label><input class="input" name="price" type="number" required value="${p.price}" /></div>
        <div class="field"><label>العدد / الكمية</label><input class="input" name="stock" type="number" value="${p.stock}" /></div>
        <div class="field"><label>سعر الشراء</label><input class="input" name="cost" type="number" value="${p.cost}" /></div>
        <div class="field"><label>الرف / المكان</label><input class="input" name="aisle" value="${p.aisle}" /></div>
        <div class="field"><label>المورد</label><input class="input" name="supplier" value="${p.supplier}" /></div>
        <div class="field"><label>حد التنبيه</label><input class="input" name="minStock" type="number" value="${p.minStock}" /></div>
        <input type="hidden" name="image" id="imageValue" value="${p.image || ""}" />
        <div class="field wide">
          <label>صورة المادة</label>
          <div class="image-picker">
            <div class="image-preview" id="imagePreview">
              ${p.image ? `<img src="${p.image}" alt="${p.name}" />` : `<span>لا توجد صورة</span>`}
            </div>
            <div class="actions">
              <label class="btn secondary" for="imageFile">اختيار صورة</label>
              <button class="btn secondary" type="button" id="removeImage">حذف الصورة</button>
            </div>
            <input class="file-input" id="imageFile" type="file" accept="image/*" />
          </div>
        </div>
        <div class="field wide"><label>ملاحظات</label><textarea class="textarea" name="note">${p.note}</textarea></div>
        <div class="actions wide">
          <button class="btn" type="submit">حفظ المادة</button>
          <button class="btn secondary" type="button" id="resetForm">تفريغ</button>
        </div>
      </form>
    </section>
  `;
}

function workerPanel() {
  return `
    <section class="panel">
      <h2>وضع العامل</h2>
      <div class="notice">يمكن للعامل البحث ومعرفة السعر والمكان والمخزون والصور، ويمكنه إضافة مادة جديدة بالباركود. الحذف والتعديل المتقدم يبقى للمدير.</div>
      <button class="btn secondary" id="requestChange">طلب تعديل سعر</button>
    </section>
  `;
}

function alertsPanel() {
  const low = state.products.filter((p) => Number(p.stock) <= Number(p.minStock));
  return `
    <section class="panel">
      <h3>تنبيهات مهمة</h3>
      ${low.length ? low.map(p => `<div class="activity-item">المخزون منخفض: ${p.name}، المتبقي ${p.stock}</div>`).join("") : `<div class="activity-item">لا توجد تنبيهات مخزون حاليًا</div>`}
    </section>
  `;
}

function stockView() {
  const rows = state.products.map((p) => {
    const status = Number(p.stock) <= Number(p.minStock) ? "منخفض" : "جيد";
    return `<article class="product"><div><h3>${p.name}</h3><div class="meta"><span class="tag">${p.aisle}</span><span class="tag">${p.category}</span><span class="tag">حد التنبيه ${p.minStock}</span></div></div><div class="price"><strong>${p.stock}</strong><small>${status}</small></div></article>`;
  }).join("");
  return `${summaryStats()}<div class="section-title"><h2>متابعة المخزون</h2></div><div class="product-list">${rows}</div>`;
}

function updatesView() {
  return `
    <section class="panel">
      <h2>سجل العمليات</h2>
      <div class="activity">${state.activity.map(item => `<div class="activity-item">${item}</div>`).join("")}</div>
    </section>
  `;
}

function adminView() {
  return `
    ${summaryStats()}
    <section class="admin-grid">
      <div class="panel admin-card">
        <h2>إضافة مادة</h2>
        <div class="notice">إضافة مادة جديدة مع باركود وصورة وسعر ومخزون.</div>
        <button class="btn gold" id="adminAddProduct">فتح إضافة مادة</button>
      </div>
      <div class="panel admin-card">
        <h2>إدارة المواد</h2>
        <div class="activity">${state.products.slice(0, 8).map((product) => `
          <div class="category-row">
            <span>${product.name}</span>
            <button class="btn secondary" data-edit="${product.id}">تعديل</button>
          </div>
        `).join("")}</div>
      </div>
      <div class="panel admin-card">
        <h2>إدارة الأسعار</h2>
        <div class="activity">${state.products.slice(0, 8).map((product) => `
          <div class="category-row">
            <span>${product.name} - ${money(product.price)}</span>
            <button class="btn secondary" data-edit="${product.id}">تعديل السعر</button>
          </div>
        `).join("")}</div>
      </div>
      <div class="panel admin-card">
        <h2>إدارة المستخدمين</h2>
        <form class="form-grid" id="userForm">
          <div class="field wide"><label>اسم المستخدم</label><input class="input" name="name" required /></div>
          <div class="field"><label>الصلاحية</label><select class="select" name="role"><option value="worker">عامل</option><option value="manager">مدير</option></select></div>
          <div class="field"><label>رمز الدخول</label><input class="input" name="code" required value="1234" /></div>
          <div class="actions wide"><button class="btn gold" type="submit">حفظ مستخدم</button></div>
        </form>
        <div class="activity">${state.users.map((user) => `
          <div class="category-row">
            <span>${user.name} - ${user.role === "manager" ? "مدير" : "عامل"}</span>
            <button class="btn secondary" data-edit-user="${user.id}">تعديل</button>
          </div>
        `).join("")}</div>
      </div>
    </section>
  `;
}

function settingsView() {
  return `
    <section class="panel">
      <h2>إعدادات التطبيق</h2>
      <div class="notice">البيانات الآن مركزية: كل الأجهزة المتصلة بنفس السيرفر تقرأ نفس المواد والأسعار والتصنيفات.</div>
      <div class="actions">
        <button class="btn secondary" id="exportData">تصدير البيانات</button>
      </div>
    </section>
    ${state.role === "manager" ? categoriesManager() : ""}
  `;
}

function categoriesManager() {
  return `
    <section class="panel">
      <h2>إدارة التصنيفات</h2>
      <form class="actions" id="categoryForm">
        <input class="input" id="categoryName" placeholder="اسم تصنيف جديد" required />
        <button class="btn gold" type="submit">إضافة تصنيف</button>
      </form>
      <div class="activity">
        ${state.categories.map((name) => `
          <div class="category-row">
            <span>${name}</span>
            <div class="actions">
              <button class="btn secondary" data-edit-category="${name}">تعديل</button>
              <button class="btn danger" data-delete-category="${name}">حذف</button>
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function scannerModal() {
  return `
    <div class="modal-backdrop" id="scannerModal">
      <section class="modal">
        <div class="modal-head">
          <h2>قارئ باركود المواد</h2>
          <button class="icon-btn" id="closeScanner" aria-label="إغلاق">×</button>
        </div>
        <div class="scanner-frame">
          <video id="scannerVideo" autoplay playsinline muted></video>
          <div class="scan-line"></div>
        </div>
        <div class="notice" id="scannerStatus">وجّه الكاميرا نحو باركود المادة</div>
        <div class="field">
          <label>إدخال الكود يدويًا</label>
          <input class="input" id="manualBarcode" placeholder="مثال: BRK-SCH-32" />
        </div>
        <input class="file-input" id="barcodeImageFile" type="file" accept="image/*" capture="environment" />
        <img id="barcodeImagePreview" alt="" style="display:none" />
        <div class="actions">
          <button class="btn" id="useManualBarcode">بحث بالكود</button>
          <label class="btn secondary" for="barcodeImageFile">تصوير باركود</label>
          <button class="btn secondary" id="closeScannerAlt">إغلاق</button>
        </div>
      </section>
    </div>
  `;
}

async function openScanner() {
  document.getElementById("modalRoot").innerHTML = scannerModal();
  bindScannerEvents();

  const status = document.getElementById("scannerStatus");
  if (!("BarcodeDetector" in window)) await loadZxing();
  if (!("BarcodeDetector" in window) && !window.ZXing) {
    status.textContent = "قارئ الباركود غير جاهز. استخدم الإدخال اليدوي أو حدّث الصفحة.";
    return;
  }

  try {
    if (window.ZXing && !("BarcodeDetector" in window)) {
      const video = document.getElementById("scannerVideo");
      state.scannerReader = new ZXing.BrowserMultiFormatReader();
      status.textContent = "الكاميرا تعمل، قرّب الباركود داخل الإطار";
      state.scannerReader.decodeFromVideoDevice(null, video, (result) => {
        if (result?.text) useBarcode(result.text);
      });
      return;
    }

    const formats = ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"];
    const detector = new BarcodeDetector({ formats });
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    state.scannerStream = stream;
    const video = document.getElementById("scannerVideo");
    video.srcObject = stream;
    status.textContent = "الكاميرا تعمل، قرّب الباركود داخل الإطار";

    state.scannerTimer = setInterval(async () => {
      if (video.readyState < 2) return;
      const codes = await detector.detect(video).catch(() => []);
      if (!codes.length) return;
      useBarcode(codes[0].rawValue);
    }, 650);
  } catch (error) {
    status.textContent = "تعذر فتح المسح المباشر. استخدم زر تصوير باركود أو الإدخال اليدوي.";
  }
}

function loadZxing() {
  if (window.ZXing) return Promise.resolve();
  if (zxingLoadPromise) return zxingLoadPromise;
  zxingLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "zxing.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return zxingLoadPromise;
}

async function readBarcodeFromImage(file) {
  const status = document.getElementById("scannerStatus");
  if (!file) return;
  if (!window.ZXing) {
    status.textContent = "قارئ الصور غير جاهز. حدّث الصفحة ثم جرّب مرة ثانية.";
    return;
  }
  const image = document.getElementById("barcodeImagePreview");
  const url = URL.createObjectURL(file);
  image.onload = async () => {
    try {
      const reader = new ZXing.BrowserMultiFormatReader();
      const result = await reader.decodeFromImageElement(image);
      URL.revokeObjectURL(url);
      if (result?.text) useBarcode(result.text);
      else status.textContent = "لم يتم العثور على باركود واضح في الصورة.";
    } catch (error) {
      URL.revokeObjectURL(url);
      status.textContent = "لم أستطع قراءة الباركود من الصورة. قرّب الكاميرا واجعل الإضاءة أقوى.";
    }
  };
  image.src = url;
}

function closeScanner() {
  if (state.scannerTimer) clearInterval(state.scannerTimer);
  state.scannerTimer = null;
  if (state.scannerReader) {
    state.scannerReader.reset();
  }
  state.scannerReader = null;
  if (state.scannerStream) {
    state.scannerStream.getTracks().forEach((track) => track.stop());
  }
  state.scannerStream = null;
  const root = document.getElementById("modalRoot");
  if (root) root.innerHTML = "";
}

function useBarcode(code) {
  const cleanCode = String(code || "").trim();
  if (!cleanCode) return;
  const found = state.products.some((product) => product.code.toLowerCase() === cleanCode.toLowerCase());
  state.query = cleanCode;
  state.category = "الكل";
  state.view = "prices";
  state.pendingBarcode = found ? "" : cleanCode;
  closeScanner();
  render();
  setTimeout(() => {
    if (found) {
      alert(`تم العثور على المادة بالكود: ${cleanCode}`);
      return;
    }
    document.getElementById("productName")?.focus();
    alert(`هذا الباركود غير مسجل: ${cleanCode}. تم وضعه في نموذج إضافة مادة جديدة.`);
  }, 100);
}

function bindScannerEvents() {
  document.getElementById("closeScanner")?.addEventListener("click", closeScanner);
  document.getElementById("closeScannerAlt")?.addEventListener("click", closeScanner);
  document.getElementById("useManualBarcode")?.addEventListener("click", () => {
    useBarcode(document.getElementById("manualBarcode").value);
  });
  document.getElementById("manualBarcode")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") useBarcode(event.target.value);
  });
  document.getElementById("barcodeImageFile")?.addEventListener("change", (event) => {
    readBarcodeFromImage(event.target.files?.[0]);
  });
}

function render() {
  document.getElementById("app").innerHTML = state.role ? shell() : loginScreen();
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  document.getElementById("loginBtn")?.addEventListener("click", async () => {
    const code = document.getElementById("loginCode").value.trim();
    const selectedRole = document.getElementById("loginRole").value;
    if (!state.users.length) await loadData({ silent: true });
    const user = state.users.find((item) => Number(item.active) === 1 && item.role === selectedRole && String(item.code) === code);
    if (!user) return alert("رمز الدخول غير صحيح لهذا النوع من المستخدم.");
    state.role = user.role;
    state.currentUserName = user.name;
    save();
    render();
  });

  document.getElementById("logout")?.addEventListener("click", () => {
    state.role = "";
    state.currentUserName = "";
    save();
    render();
  });

  document.getElementById("search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });

  document.getElementById("category")?.addEventListener("change", (event) => {
    state.category = event.target.value;
    render();
  });

  document.getElementById("productForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const item = Object.fromEntries(form.entries());
    if (!item.code) {
      alert("امسح باركود المادة أو أدخل الكود قبل الحفظ.");
      return;
    }
    const product = {
      ...item,
      id: item.id || makeId(),
      price: Number(item.price),
      cost: Number(item.cost || 0),
      stock: Number(item.stock || 0),
      minStock: Number(item.minStock || 0),
      image: item.image || "",
      updatedAt: new Date().toLocaleString("ar-IQ", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })
    };
    try {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify(product)
      });
      state.pendingBarcode = "";
      await loadData();
    } catch (error) {
      alert("تعذر حفظ المادة في القاعدة المركزية. تأكد أن السيرفر يعمل.");
    }
  });

  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = state.products.find((p) => p.id === button.dataset.edit);
      document.getElementById("formPanel").outerHTML = productForm(product);
      bindEvents();
      document.getElementById("formPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const product = state.products.find((p) => p.id === button.dataset.delete);
      if (!confirm(`حذف ${product.name}؟`)) return;
      try {
        await api(`/api/products/${product.id}`, { method: "DELETE" });
        await loadData();
      } catch (error) {
        alert("تعذر حذف المادة من القاعدة المركزية.");
      }
    });
  });

  document.getElementById("resetForm")?.addEventListener("click", () => {
    state.pendingBarcode = "";
    render();
  });
  document.getElementById("showAdd")?.addEventListener("click", () => {
    state.pendingBarcode = "";
    render();
    document.getElementById("formPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("productName")?.focus();
  });
  document.getElementById("adminAddProduct")?.addEventListener("click", () => {
    state.view = "prices";
    state.pendingBarcode = "";
    render();
    document.getElementById("formPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("productName")?.focus();
  });
  document.getElementById("scanForAdd")?.addEventListener("click", openScanner);
  document.getElementById("imageFile")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      document.getElementById("imageValue").value = reader.result;
      document.getElementById("imagePreview").innerHTML = `<img src="${reader.result}" alt="صورة المادة" />`;
    });
    reader.readAsDataURL(file);
  });
  document.getElementById("removeImage")?.addEventListener("click", () => {
    document.getElementById("imageValue").value = "";
    document.getElementById("imagePreview").innerHTML = `<span>لا توجد صورة</span>`;
    document.getElementById("imageFile").value = "";
  });
  document.getElementById("scanCode")?.addEventListener("click", openScanner);
  document.getElementById("bottomScan")?.addEventListener("click", openScanner);
  document.getElementById("requestChange")?.addEventListener("click", () => {
    alert("تم تسجيل طلب مراجعة السعر للمدير.");
  });
  document.getElementById("exportData")?.addEventListener("click", () => {
    const data = JSON.stringify({ products: state.products, activity: state.activity }, null, 2);
    navigator.clipboard?.writeText(data);
    alert("تم نسخ بيانات التطبيق بصيغة JSON.");
  });
  document.getElementById("categoryForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("categoryName").value.trim();
    if (!name) return;
    try {
      await api("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
      await loadData();
    } catch (error) {
      alert("تعذر إضافة التصنيف.");
    }
  });
  document.querySelectorAll("[data-edit-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      const oldName = button.dataset.editCategory;
      const newName = prompt("اسم التصنيف الجديد", oldName);
      if (!newName || newName.trim() === oldName) return;
      try {
        await api(`/api/categories/${encodeURIComponent(oldName)}`, {
          method: "PUT",
          body: JSON.stringify({ name: newName.trim() })
        });
        await loadData();
      } catch (error) {
        alert("تعذر تعديل التصنيف.");
      }
    });
  });
  document.querySelectorAll("[data-delete-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      const name = button.dataset.deleteCategory;
      if (!confirm(`حذف التصنيف ${name}؟`)) return;
      try {
        await api(`/api/categories/${encodeURIComponent(name)}`, { method: "DELETE" });
        if (state.category === name) state.category = "الكل";
        await loadData();
      } catch (error) {
        alert("لا يمكن حذف هذا التصنيف لأنه مستخدم داخل مواد. انقل المواد إلى تصنيف آخر أولًا.");
      }
    });
  });
  document.getElementById("userForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const user = Object.fromEntries(form.entries());
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify(user) });
      await loadData();
    } catch (error) {
      alert("تعذر حفظ المستخدم.");
    }
  });
  document.querySelectorAll("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const user = state.users.find((item) => item.id === button.dataset.editUser);
      if (!user) return;
      const name = prompt("اسم المستخدم", user.name);
      if (!name) return;
      const code = prompt("رمز الدخول", user.code);
      if (!code) return;
      const role = confirm("هل هذا المستخدم مدير؟ اضغط موافق للمدير أو إلغاء للعامل.") ? "manager" : "worker";
      try {
        await api("/api/users", {
          method: "POST",
          body: JSON.stringify({ ...user, name: name.trim(), code: code.trim(), role })
        });
        await loadData();
      } catch (error) {
        alert("تعذر تعديل المستخدم.");
      }
    });
  });
}

loadData();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.role) loadData({ silent: true }).then(render).catch(() => {});
});
