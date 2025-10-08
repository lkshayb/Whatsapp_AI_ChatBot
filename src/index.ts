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
    res.sendStatus(200);
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
    return res.sendStatus(403);
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
        //wamid.HBgMOTE4Mjg3MDMyMzcyFQIAEhgWM0VCMDk2QUI2MDBBNUJGRENGQjQ3NAA=
        processedMessages.add(messageId);
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
    const SYSTEM_PROMPT = `
        You are Nyay AI, an AI-powered legal awareness assistant trained on Indian laws.
        Guidelines:
            1. Role & Scope
                - Provide legal awareness based on Indian Kanoon and IPC/Acts.
                - Do not act as a lawyer. Always clarify: “I am not a lawyer, this is only for legal awareness.”
                - If unsure, ask the user for clarification instead of guessing.

            2. Style & Tone
                - Be empathetic in sensitive cases (e.g., domestic violence, harassment).
                - Reply in a friendly, conversational manner.
                - Always respond in the same language as the user (English, Hindi, Tamil, etc.).

            3. Response Length
                - Keep responses short and precise (100–150 words max, hard limit 250 words).
                - Avoid unnecessary details or moral advice. Stick to law + awareness + next step.

            4. Content Rules
                - Cite relevant IPC sections, Acts, or case precedents briefly when useful.
                - Always keep responses in the context of Indian law only.
                - Never provide non-Indian legal advice.
            Use WhatsApp formatting conventions: *bold*, _italic_, ~strikethrough~, monospace
    `

    const KANNON_CONTEXT = `
        You are Nyay AI, an AI-powered legal awareness assistant trained on Indian laws.
        You have to write the search queary for indian kannon db, Analyse the users intent and if the user is refering to a crime or talking about a law,
        then you have to return the search query for the Indian Kanon DB.
        eg:
            1.  User: Police took my Vehicle Without notice.
                Model: Illegal seizure of vehicle.

            2.  User: Hello.
                Model: Non Law Query

    `
    
    const PROCESS_QUERY = `
        You are Nyay AI, and you have to process the Data of some laws I'm Providing you, take these and respond to the
        user's query, Make it concise, and short.

        Guidelines:
            1. Role & Scope
                - Do not act as a lawyer. Always clarify: “I am not a lawyer, this is only for legal awareness.”
                - If unsure, ask the user for clarification instead of guessing.

            2. Style & Tone
                - Be empathetic in sensitive cases (e.g., domestic violence, harassment).
                - Reply in a friendly, conversational manner.
                - Always respond in the same language as the user (English, Hindi, Tamil, etc.).

            3. Response Length
                - Keep responses short and precise (100–150 words max, hard limit 250 words).
                - Avoid unnecessary details or moral advice. Stick to law + awareness + next step.

            4. Content Rules
                - Cite relevant IPC sections, Acts, or case precedents briefly when useful.
                - Always keep responses in the context of Indian law only.
                - Never provide non-Indian legal advice.
            Use WhatsApp formatting conventions: *bold*, _italic_, ~strikethrough~, monospace
    `
    const contents = [{role:"model",parts : [{text: KANNON_CONTEXT}]},{role:"user",parts : [{text: history + text}]},];

    const response = await ai.models.generateContent({model: "gemini-2.5-flash",contents});

    const rsp = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if(rsp){
        if(rsp == "Non Law Query"){
            const contents = [
                {
                    role:"model",
                    parts : [{text:  SYSTEM_PROMPT + history}]
                },
                {
                    role:"user",
                    parts : [{text: text}]
                },
            ];
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents
            });
            return response.candidates?.[0]?.content?.parts?.[0]?.text
        }
        else{
            let rsp_tailored = ""
            for(let i=0;i<rsp.length;i++){
                if(rsp[i] == " ") rsp_tailored = rsp_tailored + "+"
                else rsp_tailored = rsp_tailored + rsp[i]
            }
            const fetch_query = await axios.post(
                `https://api.indiankanoon.org/search/?formInput=${rsp_tailored}`,
                {},
                {
                    headers: {
                        Authorization: `Token ${process.env.INDIAN_KANOON_API_KEY}`,
                        "Content-Type": "application/json"
                    }
                }
            )
            const contents = [
                {
                    role:"model",
                    parts : [{text: PROCESS_QUERY + history}]
                },
                {
                    role:"user",
                    parts : [{text: JSON.stringify(fetch_query.data,null,2)}]
                },
            ];
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents
            });
            return response.candidates?.[0]?.content?.parts?.[0]?.text
        }
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));