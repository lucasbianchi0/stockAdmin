import { WhatsappClient } from "@/components/whatsapp/whatsapp-client"

/**
 * Los chats del WhatsApp de Accedra. Llegan solos desde Kapso; ver
 * `lib/whatsapp-server.ts`.
 */
export const metadata = { title: "WhatsApp · Accedra" }

export default function WhatsappPage() {
  return (
    <main className="flex min-h-full flex-col">
      <WhatsappClient />
    </main>
  )
}
