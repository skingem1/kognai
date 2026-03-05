import { redirect } from "next/navigation";

// Redirects to the correct API keys page which has:
// - KeyRevealModal that shows the full sk_... key immediately after creation
// - Correct VPS backend integration with customerId = user.id
// - Working list and revoke endpoints
export default function ApiKeysRedirect() {
  redirect("/dashboard/api-keys");
}
