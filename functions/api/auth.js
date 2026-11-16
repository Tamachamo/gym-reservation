async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "_gym_salt_v1");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  const { action } = body;

  try {
    // ログイン処理
    if (action === "login") {
      const { email, password } = body;
      const passwordHash = await hashPassword(password);
      const user = await env.DB.prepare(
        "SELECT id, name, organization, email, phone FROM users WHERE email = ? AND password_hash = ?"
      )
        .bind(email, passwordHash)
        .first();

      if (!user) {
        return Response.json(
          { error: "メールアドレスまたはパスワードが正しくありません。" },
          { status: 401 }
        );
      }
      return Response.json({ user });
    }

    // 新規アカウント登録
    if (action === "register") {
      const { name, organization, email, phone, password } = body;
      if (!name || !email || !phone || !password) {
        return Response.json({ error: "必須項目が入力されていません。" }, { status: 400 });
      }
      const passwordHash = await hashPassword(password);
      const orgValue = organization?.trim() || "個人";

      const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
        .bind(email)
        .first();
      if (existing) {
        return Response.json(
          { error: "このメールアドレスは既に登録されています。" },
          { status: 409 }
        );
      }

      const result = await env.DB.prepare(
        "INSERT INTO users (name, organization, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)"
      )
        .bind(name, orgValue, email, phone, passwordHash)
        .run();

      const user = {
        id: result.meta.last_row_id,
        name,
        organization: orgValue,
        email,
        phone,
      };
      return Response.json({ user });
    }

    // プロフィール更新
    if (action === "update") {
      const { id, name, organization, email, phone } = body;
      const orgValue = organization?.trim() || "個人";
      await env.DB.prepare(
        "UPDATE users SET name = ?, organization = ?, email = ?, phone = ? WHERE id = ?"
      )
        .bind(name, orgValue, email, phone, id)
        .run();

      return Response.json({
        user: { id, name, organization: orgValue, email, phone },
      });
    }

    return Response.json({ error: "不正なリクエストです。" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
