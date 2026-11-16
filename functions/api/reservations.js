export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const month = url.searchParams.get("month"); // YYYY-MM
  const userId = url.searchParams.get("userId");

  try {
    // マイページ用：特定ユーザーの予約一覧
    if (userId) {
      const { results } = await env.DB.prepare(
        "SELECT * FROM reservations WHERE user_id = ? AND status = 'confirmed' ORDER BY reservation_date ASC, start_time ASC"
      )
        .bind(userId)
        .all();
      return Response.json({ reservations: results });
    }

    // カレンダー用：月別（または全件）予約一覧（個人情報保護のため公開項目を絞る）
    if (month) {
      const { results } = await env.DB.prepare(
        `SELECT id, reservation_date, start_time, end_time, organization, fee 
         FROM reservations 
         WHERE reservation_date LIKE ? AND status = 'confirmed' 
         ORDER BY reservation_date ASC, start_time ASC`
      )
        .bind(`${month}-%`)
        .all();
      return Response.json({ reservations: results });
    }

    return Response.json({ reservations: [] });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  const {
    user_id,
    reservation_date,
    start_time,
    end_time,
    applicant_name,
    organization,
    email,
    phone,
    fee,
  } = body;

  if (!reservation_date || !start_time || !end_time || !applicant_name || !email || !phone) {
    return Response.json({ error: "必須項目を入力してください。" }, { status: 400 });
  }

  try {
    // 時間帯の重複チェック（既存開始 < 新規終了 AND 既存終了 > 新規開始）
    const overlap = await env.DB.prepare(
      `SELECT id FROM reservations 
       WHERE reservation_date = ? 
       AND status = 'confirmed' 
       AND start_time < ? 
       AND end_time > ?`
    )
      .bind(reservation_date, end_time, start_time)
      .first();

    if (overlap) {
      return Response.json(
        { error: "選択された時間帯は既に他の予約が入っています。" },
        { status: 409 }
      );
    }

    const orgValue = organization?.trim() || "個人";
    const result = await env.DB.prepare(
      `INSERT INTO reservations 
       (user_id, reservation_date, start_time, end_time, applicant_name, organization, email, phone, fee) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        user_id || null,
        reservation_date,
        start_time,
        end_time,
        applicant_name,
        orgValue,
        email,
        phone,
        fee
      )
      .run();

    return Response.json({
      success: true,
      id: result.meta.last_row_id,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const userId = url.searchParams.get("userId");

  if (!id || !userId) {
    return Response.json({ error: "パラメータが不足しています。" }, { status: 400 });
  }

  try {
    await env.DB.prepare(
      "UPDATE reservations SET status = 'cancelled' WHERE id = ? AND user_id = ?"
    )
      .bind(id, userId)
      .run();

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
