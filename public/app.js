const state = {
  currentDate: new Date(),
  selectedDateStr: formatDate(new Date()),
  reservations: [],
  user: JSON.parse(localStorage.getItem("gym_user") || "null"),
  guestMode: "guest", // 'guest' | 'login'
};

// 料金区分定義
const SLOTS = {
  morning: { label: "午前", start: "09:00", end: "12:00", sMin: 9 * 60, eMin: 12 * 60, fee: 2000 },
  afternoon: { label: "午後", start: "13:00", end: "17:00", sMin: 13 * 60, eMin: 17 * 60, fee: 2000 },
  night: { label: "夜間", start: "18:00", end: "22:00", sMin: 18 * 60, eMin: 22 * 60, fee: 3000 },
};

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonthStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// 区分かぶり判定による料金計算（少しでも重なればその区分の料金を合算）
function calculateFee(startTime, endTime) {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  if (e <= s) {
    return { fee: 0, note: "終了時間は開始時間より後に設定してください", matched: [] };
  }

  const matched = [];
  let total = 0;

  // 各区分 [sMin, eMin] と選択範囲 [s, e] が少しでも重なるか判定 (s < eMin && e > sMin)
  for (const [key, slot] of Object.entries(SLOTS)) {
    if (s < slot.eMin && e > slot.sMin) {
      matched.push(key);
      total += slot.fee;
    }
  }

  if (matched.length === 0) {
    return {
      fee: 0,
      note: "※利用区分（9:00-12:00 / 13:00-17:00 / 18:00-22:00）を含む時間帯を指定してください",
      matched: [],
    };
  }

  if (matched.length === 3) {
    return {
      fee: 7000,
      note: "適用区分：終日（午前＋午後＋夜間）",
      matched,
    };
  }

  const breakdownText = matched
    .map((k) => `${SLOTS[k].label}(${SLOTS[k].fee.toLocaleString()}円)`)
    .join(" ＋ ");

  return {
    fee: total,
    note: `適用区分：${breakdownText}`,
    matched,
  };
}

// 30分刻みセレクトボックス生成（09:00〜22:00）
function initTimeSelects() {
  const startSel = document.getElementById("book-start-time");
  const endSel = document.getElementById("book-end-time");
  startSel.innerHTML = "";
  endSel.innerHTML = "";

  for (let mins = 9 * 60; mins <= 22 * 60; mins += 30) {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    const label = `${h}:${m}`;
    if (mins < 22 * 60) startSel.add(new Option(label, label));
    if (mins > 9 * 60) endSel.add(new Option(label, label));
  }
  startSel.value = "09:00";
  endSel.value = "12:00";
  updateFeeAndPresetUI();
}

// 料金表示とクイック選択ボタンのハイライト同期
function updateFeeAndPresetUI() {
  const s = document.getElementById("book-start-time").value;
  const e = document.getElementById("book-end-time").value;
  const { fee, note, matched } = calculateFee(s, e);

  document.getElementById("calculated-fee").textContent = `${fee.toLocaleString()} 円`;
  document.getElementById("fee-breakdown").textContent = note;

  // ボタンのアクティブ状態を現在の該当区分に合わせる
  document.querySelectorAll(".btn-preset").forEach((btn) => {
    const slotKey = btn.dataset.slot;
    if (slotKey === "all") {
      btn.classList.toggle("active", matched.length === 3);
    } else {
      btn.classList.toggle("active", matched.includes(slotKey));
    }
  });
}

// クイック選択ボタン（複数選択トグル）のクリック処理
function handlePresetToggle(clickedSlot) {
  const s = document.getElementById("book-start-time").value;
  const e = document.getElementById("book-end-time").value;
  const { matched } = calculateFee(s, e);
  const selectedSet = new Set(matched);

  if (clickedSlot === "all") {
    // 終日ボタン：既に3区分すべて選択中なら午前のみに戻す、そうでなければ全選択
    if (selectedSet.size === 3) {
      selectedSet.clear();
      selectedSet.add("morning");
    } else {
      selectedSet.add("morning");
      selectedSet.add("afternoon");
      selectedSet.add("night");
    }
  } else {
    // 午前・午後・夜間のトグル（最低1つは残す）
    if (selectedSet.has(clickedSlot)) {
      if (selectedSet.size > 1) {
        selectedSet.delete(clickedSlot);
      }
    } else {
      selectedSet.add(clickedSlot);
    }
  }

  // 選択された区分の最も早い開始時間と最も遅い終了時間をセット
  const activeSlots = Array.from(selectedSet).map((k) => SLOTS[k]);
  const minStart = activeSlots.reduce((min, cur) => (cur.sMin < min.sMin ? cur : min), activeSlots[0]);
  const maxEnd = activeSlots.reduce((max, cur) => (cur.eMin > max.eMin ? cur : max), activeSlots[0]);

  document.getElementById("book-start-time").value = minStart.start;
  document.getElementById("book-end-time").value = maxEnd.end;
  updateFeeAndPresetUI();
}

// API通信: 月間予約取得
async function fetchMonthReservations() {
  const month = getMonthStr(state.currentDate);
  const res = await fetch(`/api/reservations?month=${month}`);
  const data = await res.json();
  state.reservations = data.reservations || [];
  renderCalendar();
  renderSelectedDayDetail();
}

// カレンダー描画
function renderCalendar() {
  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  document.getElementById("current-month-label").textContent = `${year}年 ${month + 1}月`;

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    let cellDate;
    let isOther = false;
    if (i < firstDay) {
      cellDate = new Date(year, month - 1, prevDays - firstDay + i + 1);
      isOther = true;
    } else if (i >= firstDay + daysInMonth) {
      cellDate = new Date(year, month + 1, i - (firstDay + daysInMonth) + 1);
      isOther = true;
    } else {
      cellDate = new Date(year, month, i - firstDay + 1);
    }

    const dateStr = formatDate(cellDate);
    const dayBookings = state.reservations.filter((r) => r.reservation_date === dateStr);

    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (isOther) cell.classList.add("other-month");
    if (dateStr === state.selectedDateStr) cell.classList.add("selected");
    if (dayBookings.length > 0) cell.classList.add("has-booking");

    const dow = cellDate.getDay();
    const dowClass = dow === 0 ? "sun" : dow === 6 ? "sat" : "";

    const badgesHtml = dayBookings
      .map((b) => {
        const sMin = timeToMinutes(b.start_time);
        const cls = sMin < 13 * 60 ? "morning" : sMin < 18 * 60 ? "afternoon" : "night";
        return `<span class="badge-slot ${cls}">${b.start_time}-${b.end_time} ${b.organization}</span>`;
      })
      .join("");

    cell.innerHTML = `
      <div class="cal-cell-top">
        <span class="day-num ${dowClass}">${cellDate.getDate()}</span>
        <button type="button" class="btn-plus" title="${dateStr}を予約">＋</button>
      </div>
      <div class="booking-badges">${badgesHtml}</div>
    `;

    cell.addEventListener("click", (e) => {
      state.selectedDateStr = dateStr;
      renderCalendar();
      renderSelectedDayDetail();
      if (e.target.closest(".btn-plus")) {
        openBookingModal(dateStr);
      }
    });

    grid.appendChild(cell);
  }
}

function renderSelectedDayDetail() {
  document.getElementById("selected-date-title").textContent = `${state.selectedDateStr} の予約状況`;
  const list = document.getElementById("day-timeline");
  const dayBookings = state.reservations.filter((r) => r.reservation_date === state.selectedDateStr);

  if (dayBookings.length === 0) {
    list.innerHTML = `<p style="color:#64748b;font-size:0.9rem;">現在予約はありません（終日空きあり）</p>`;
    return;
  }

  list.innerHTML = dayBookings
    .map(
      (b) => `
    <div class="timeline-item">
      <strong>${b.start_time} 〜 ${b.end_time}</strong>
      <span>予約済み（${b.organization}）</span>
    </div>`
    )
    .join("");
}

// 予約モーダル制御
function openBookingModal(dateStr) {
  document.getElementById("book-date").value = dateStr || state.selectedDateStr;
  document.getElementById("booking-error").classList.add("hidden");
  updateFeeAndPresetUI();

  if (state.user) {
    document.getElementById("logged-in-applicant-box").classList.remove("hidden");
    document.getElementById("guest-or-login-box").classList.add("hidden");
    document.getElementById("summary-user-name").textContent = state.user.name;
    document.getElementById("summary-user-org").textContent = state.user.organization;
    document.getElementById("summary-user-email").textContent = state.user.email;
    document.getElementById("summary-user-phone").textContent = state.user.phone;
  } else {
    document.getElementById("logged-in-applicant-box").classList.add("hidden");
    document.getElementById("guest-or-login-box").classList.remove("hidden");
  }

  document.getElementById("booking-modal").classList.remove("hidden");
}

function closeBookingModal() {
  document.getElementById("booking-modal").classList.add("hidden");
}

// 認証状態UI更新
function syncAuthUI() {
  const authBtn = document.getElementById("btn-header-auth");
  if (state.user) {
    authBtn.textContent = `ログアウト (${state.user.name})`;
    document.getElementById("mypage-guest-notice").classList.add("hidden");
    document.getElementById("mypage-content").classList.remove("hidden");
    document.getElementById("prof-name").value = state.user.name;
    document.getElementById("prof-org").value = state.user.organization;
    document.getElementById("prof-email").value = state.user.email;
    document.getElementById("prof-phone").value = state.user.phone;
    loadMyReservations();
  } else {
    authBtn.textContent = "ログイン";
    document.getElementById("mypage-guest-notice").classList.remove("hidden");
    document.getElementById("mypage-content").classList.add("hidden");
  }
}

async function loadMyReservations() {
  if (!state.user) return;
  const res = await fetch(`/api/reservations?userId=${state.user.id}`);
  const data = await res.json();
  const container = document.getElementById("my-reservations-list");
  const items = data.reservations || [];

  if (items.length === 0) {
    container.innerHTML = `<p style="color:#64748b;">現在予約はありません。</p>`;
    return;
  }

  container.innerHTML = items
    .map(
      (r) => `
    <div class="res-card">
      <div>
        <strong>${r.reservation_date} ${r.start_time}〜${r.end_time}</strong>
        <div style="font-size:0.85rem;color:#475569;">団体: ${r.organization} / 料金: ${Number(r.fee).toLocaleString()}円</div>
      </div>
      <button type="button" class="btn-danger" onclick="cancelReservation(${r.id})">取消</button>
    </div>`
    )
    .join("");
}

window.cancelReservation = async function (id) {
  if (!confirm("この予約をキャンセルしますか？")) return;
  await fetch(`/api/reservations?id=${id}&userId=${state.user.id}`, { method: "DELETE" });
  await loadMyReservations();
  await fetchMonthReservations();
};

// イベントリスナー登録
document.addEventListener("DOMContentLoaded", () => {
  initTimeSelects();
  syncAuthUI();
  fetchMonthReservations();

  // 月移動
  document.getElementById("prev-month").addEventListener("click", () => {
    state.currentDate.setMonth(state.currentDate.getMonth() - 1);
    fetchMonthReservations();
  });
  document.getElementById("next-month").addEventListener("click", () => {
    state.currentDate.setMonth(state.currentDate.getMonth() + 1);
    fetchMonthReservations();
  });
  document.getElementById("today-btn").addEventListener("click", () => {
    state.currentDate = new Date();
    state.selectedDateStr = formatDate(new Date());
    fetchMonthReservations();
  });

  // ナビゲーション切り替え
  const showView = (viewName) => {
    document.querySelectorAll(".view-section").forEach((el) => el.classList.remove("active"));
    document.querySelectorAll(".btn-nav").forEach((el) => el.classList.remove("active"));
    document.getElementById(`view-${viewName}`).classList.add("active");
    document.getElementById(`btn-view-${viewName}`).classList.add("active");
    if (viewName === "mypage" && state.user) loadMyReservations();
  };
  document.getElementById("btn-view-calendar").addEventListener("click", () => showView("calendar"));
  document.getElementById("nav-top").addEventListener("click", () => showView("calendar"));
  document.getElementById("btn-view-mypage").addEventListener("click", () => showView("mypage"));

  // モーダル開閉
  document.getElementById("btn-open-modal-selected").addEventListener("click", () => openBookingModal());
  document.getElementById("close-booking-modal").addEventListener("click", closeBookingModal);
  document.getElementById("cancel-booking-btn").addEventListener("click", closeBookingModal);

  // 時間・料金プリセット（複数選択トグル）
  document.querySelectorAll(".btn-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      handlePresetToggle(btn.dataset.slot);
    });
  });
  document.getElementById("book-start-time").addEventListener("change", updateFeeAndPresetUI);
  document.getElementById("book-end-time").addEventListener("change", updateFeeAndPresetUI);

  // モーダル内のゲスト / ログイン切替
  document.querySelectorAll("#guest-or-login-box .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#guest-or-login-box .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.guestMode = btn.dataset.mode;
      document.getElementById("guest-fields").classList.toggle("hidden", state.guestMode !== "guest");
      document.getElementById("modal-login-fields").classList.toggle("hidden", state.guestMode !== "login");
    });
  });

  // 同時アカウント登録チェックボックス
  document.getElementById("guest-register-check").addEventListener("change", (e) => {
    document.getElementById("guest-password-wrap").classList.toggle("hidden", !e.target.checked);
  });

  // 予約確定（OK押下）処理
  document.getElementById("booking-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("booking-error");
    errEl.classList.add("hidden");

    const reservation_date = document.getElementById("book-date").value;
    const start_time = document.getElementById("book-start-time").value;
    const end_time = document.getElementById("book-end-time").value;
    const { fee, note } = calculateFee(start_time, end_time);

    if (fee <= 0) {
      errEl.textContent = note;
      errEl.classList.remove("hidden");
      return;
    }

    let applicant = state.user;

    // 未ログイン時の処理
    if (!applicant) {
      if (state.guestMode === "login") {
        const email = document.getElementById("modal-login-email").value;
        const password = document.getElementById("modal-login-password").value;
        const loginRes = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "login", email, password }),
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) {
          errEl.textContent = loginData.error;
          errEl.classList.remove("hidden");
          return;
        }
        state.user = loginData.user;
        localStorage.setItem("gym_user", JSON.stringify(state.user));
        applicant = state.user;
      } else {
        const name = document.getElementById("guest-name").value.trim();
        const organization = document.getElementById("guest-org").value.trim() || "個人";
        const email = document.getElementById("guest-email").value.trim();
        const phone = document.getElementById("guest-phone").value.trim();
        const wantRegister = document.getElementById("guest-register-check").checked;
        const password = document.getElementById("guest-password").value;

        if (!name || !email || !phone) {
          errEl.textContent = "名前・メールアドレス・電話番号は必須です。";
          errEl.classList.remove("hidden");
          return;
        }

        if (wantRegister) {
          if (!password || password.length < 6) {
            errEl.textContent = "アカウント登録する場合は6文字以上のパスワードを入力してください。";
            errEl.classList.remove("hidden");
            return;
          }
          const regRes = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "register", name, organization, email, phone, password }),
          });
          const regData = await regRes.json();
          if (!regRes.ok) {
            errEl.textContent = regData.error;
            errEl.classList.remove("hidden");
            return;
          }
          state.user = regData.user;
          localStorage.setItem("gym_user", JSON.stringify(state.user));
          applicant = state.user;
        } else {
          applicant = { id: null, name, organization, email, phone };
        }
      }
    }

    // 予約API実行
    const bookRes = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: applicant.id || null,
        reservation_date,
        start_time,
        end_time,
        applicant_name: applicant.name,
        organization: applicant.organization,
        email: applicant.email,
        phone: applicant.phone,
        fee,
      }),
    });
    const bookData = await bookRes.json();

    if (!bookRes.ok) {
      errEl.textContent = bookData.error || "予約の登録に失敗しました。";
      errEl.classList.remove("hidden");
      return;
    }

    closeBookingModal();
    syncAuthUI();
    await fetchMonthReservations();

    if (state.user) {
      alert("予約が完了しました！マイページに反映されています。");
      showView("mypage");
    } else {
      alert("予約が完了しました！");
    }
  });

  // 単体ログイン・ログアウト処理
  document.getElementById("btn-header-auth").addEventListener("click", () => {
    if (state.user) {
      state.user = null;
      localStorage.removeItem("gym_user");
      syncAuthUI();
      showView("calendar");
    } else {
      document.getElementById("auth-modal").classList.remove("hidden");
    }
  });
  document.getElementById("btn-mypage-login").addEventListener("click", () => {
    document.getElementById("auth-modal").classList.remove("hidden");
  });
  document.getElementById("close-auth-modal").addEventListener("click", () => {
    document.getElementById("auth-modal").classList.add("hidden");
  });

  document.querySelectorAll("#auth-modal .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#auth-modal .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const isLogin = btn.dataset.authTab === "login";
      document.getElementById("standalone-login-form").classList.toggle("hidden", !isLogin);
      document.getElementById("standalone-register-form").classList.toggle("hidden", isLogin);
    });
  });

  document.getElementById("standalone-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "login",
        email: document.getElementById("login-email").value,
        password: document.getElementById("login-password").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = document.getElementById("auth-error");
      err.textContent = data.error;
      err.classList.remove("hidden");
      return;
    }
    state.user = data.user;
    localStorage.setItem("gym_user", JSON.stringify(state.user));
    document.getElementById("auth-modal").classList.add("hidden");
    syncAuthUI();
  });

  document.getElementById("standalone-register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register",
        name: document.getElementById("reg-name").value,
        organization: document.getElementById("reg-org").value || "個人",
        email: document.getElementById("reg-email").value,
        phone: document.getElementById("reg-phone").value,
        password: document.getElementById("reg-password").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = document.getElementById("reg-error");
      err.textContent = data.error;
      err.classList.remove("hidden");
      return;
    }
    state.user = data.user;
    localStorage.setItem("gym_user", JSON.stringify(state.user));
    document.getElementById("auth-modal").classList.add("hidden");
    syncAuthUI();
  });

  // プロフィール更新
  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: state.user.id,
        name: document.getElementById("prof-name").value,
        organization: document.getElementById("prof-org").value || "個人",
        email: document.getElementById("prof-email").value,
        phone: document.getElementById("prof-phone").value,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      state.user = data.user;
      localStorage.setItem("gym_user", JSON.stringify(state.user));
      syncAuthUI();
      alert("申請者情報を更新しました。");
    }
  });
});
