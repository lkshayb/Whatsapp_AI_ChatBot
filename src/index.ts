import express from "express";
import type { Request, Response } from "express";
import "dotenv/config"; 
import { appendMessage, getHistory} from './chatstore.js';
import { sendWhatsappText,sendTypingStatus } from "./sendWhatsappText.js";
import { getResponse } from "./response_fetch.js";
const app = express();
app.use(express.json());

//webhook connection endpoint
app.get('/webhook',async (req:Request,res:Response) => {
    const token_server:string | undefined = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("data => ",mode,token,challenge);

    if(mode === "subscribe" && token === token_server) {
        console.log("Successfully subscribed to webhook")
        return res.status(200).send(challenge);
    }
})

const processedMessages = new Set<string>();
//main webhook post endpoint
app.post('/webhook',async (req:Request,res:Response) => {
    res.sendStatus(200);
    console.log("***REACHED WEBHOOK ENDPOINT FOR MESSAGING***")
    
    try{
        const entry = req.body?.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const messages= value?.messages as any[];
        if(!messages) return
        console.log(messages)
        const messageId = messages[0]?.id;
        if (processedMessages.has(messageId)) {
            console.log("Duplicate message ignored:", messageId);
            return;
        }
        processedMessages.add(messageId);
        sendTypingStatus(messages[0].id)

        if (messages.length > 0) {
            const msg = messages[0];
            const from = msg.from;                      
            const text = msg.text?.body || "";           

            appendMessage(entry.id, { role: "user", text: messages[0].text.body, time: Date.now() });

            const history = getHistory(entry.id) || [];
            const replyText = await getResponse(text,history);
            
            appendMessage(entry.id, { role: "model", text: replyText, time: Date.now() });
            
            if(replyText) await sendWhatsappText(from, replyText);
        }
    }catch(e){
        console.error("Webhook error:", e);
    }
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));