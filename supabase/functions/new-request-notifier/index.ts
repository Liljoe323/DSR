import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from  ;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  const { record } = await req.json();  // payload from your DB trigger

  // 1) fetch all tokens (or filter by technician role, etc.)
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token");

  // 2) fire a push for each
  const messages = tokens!.map(({ token }) => ({
    to: token,
    sound: "default",
    title: "New Service Request",
    body: `${record.title} submitted by ${record.contact}`,
    data: { requestId: record.id },
  }));

  // 3) send in batches of 100
  for (let i = 0; i < messages.length; i += 100) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }

  return new Response("ok", { status: 200 });
});
// set up a Supabase Realtime subscription (or a webhook in Supabase triggers) to POST here
app.listen(3000, () => console.log("Notifier running on 3000"));
