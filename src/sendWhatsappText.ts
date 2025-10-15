import axios from "axios";
import "dotenv/config"; 

async function sendTypingStatus(to: string) {
    try{
        await axios.post(
            `https://graph.facebook.com/v24.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                status: "read",
                message_id: to,
                typing_indicator: {
                    type: "text"
                }
            },
            {
                headers: {Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,"Content-Type": "application/json"}
            }
        );
    }
    catch(e){
        console.log(e)
    }
}

async function sendWhatsappText(to: string,id:string, body: string) {
    console.log("Using token present?:", !!process.env.WHATSAPP_TOKEN);
    const resp = await axios.post(
        `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            context: {
                message_id: id
            },
            type: "text",
            text: { body }
        },
        {
            headers: {Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,"Content-Type": "application/json"}
        }
    );
    console.log(resp.status)
}

export {sendWhatsappText,sendTypingStatus}