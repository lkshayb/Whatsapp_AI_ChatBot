import express from "express";
import type { Request, Response } from "express";
import axios from "axios";
import "dotenv/config"; 
import { GoogleGenAI } from "@google/genai";
import { appendMessage, getHistory} from './chatstore.js';

const google_api = process.env.GEMINI_API_KEY;
console.log(google_api);
const ai = new GoogleGenAI({ apiKey: `${google_api}`});

const app = express();
app.use(express.json());

//webhook connection endpoint
app.get('/webhook',(req:Request,res:Response) => {
    console.log("REACHED AUTH WEBHOOK ENDPOINT")
    const token_server:string | undefined = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log(mode,token,challenge);
    console.log("Token With Server :",token_server)

    if(mode === "subscribe" && token === token_server) {
        return res.status(200).send(challenge);
    }
})

//Testing endpoint
app.get('/test',(req:Request,res:Response) => res.send(true));


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
        sendWhatsappText(messages[0].from,"Typing...")
        if (messages.length > 0) {
            const msg = messages[0];
            const from = msg.from;                      
            const text = msg.text?.body || "";           

            appendMessage(entry.id, { role: "user", text: messages[0].text.body, time: Date.now() });

            const history = getHistory(entry.id) || [];
            const replyText = await getResponse(text,history);
            
            appendMessage(entry.id, { role: "model", text: replyText, time: Date.now() });
            
            if(replyText){
                await sendWhatsappText(from, replyText);
            }
        }
    }catch(e){
        console.error("Webhook error:", e);
    }
})

//function to forward message to whatsapp
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

async function getResponse(text:string,history:string | never[]):Promise<string | undefined>{

    const contents = [
        {
            role: "model",
            parts: [
                {
                    text: process.env.KANNON_CONTEXT ?? ""
                }
            ]
        },
        {
            role: "user",
            parts: [
                {
                    text: (history ?? "") + "\n" + (text ?? "")
                }
            ]
        }
    ];

    const response = await ai.models.generateContent({model: "gemini-2.5-flash",contents});

    const rsp = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!rsp) return "Sorry, I couldn’t process your question.";

    if(rsp === "Non Law Query"){
        const contents = [
            {
                role:"model",
                parts : [{text:  process.env.SYSTEM_PROMPT +"\n"+ history}]
            },
            {
                role:"user",
                parts : [{text}]
            },
        ];
        const response = await ai.models.generateContent({model: "gemini-2.5-flash",contents});
        return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    }

    const rsp_tailored = encodeURIComponent(rsp)
    const fetch_query = await axios.post(`https://api.indiankanoon.org/search/?formInput=${rsp_tailored}`,
        {},
        {
            headers: {
                Authorization: `Token ${process.env.INDIAN_KANOON_API_KEY}`,
                "Content-Type": "application/json"
            }
        }
    )
    const processedResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
            { role: "model", parts: [{ text: process.env.PROCESS_QUERY + "\n" + history }] },
            { role: "user", parts: [{ text: JSON.stringify(fetch_query.data, null, 2) }] },
        ],
    });
    return processedResponse.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      
    
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));