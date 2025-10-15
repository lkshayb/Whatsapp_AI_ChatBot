import axios from "axios";

async function sendWhatsappText(to: string, body: string) {
    console.log("Using token present?:", !!process.env.WHATSAPP_TOKEN);
    const resp = await axios.post(
        `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body }
        },
        {
            headers: {Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,"Content-Type": "application/json"}
        }
    );
    console.log(resp.status)
}

export {sendWhatsappText}