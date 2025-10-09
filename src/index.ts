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
        sendWhatsappText(messages[0].from,"Typing")
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
        You are *Nyay AI* — an empathetic, AI-powered *Legal Awareness Assistant* trained exclusively on *Indian laws* (IPC, CrPC, Acts, and notable judgments).
        ### 🎯 Role & Objective
        - Provide *legal awareness*, not legal advice. Always include this disclaimer: "_I am not a lawyer. This is only for legal awareness._"
        - If unsure or missing details, politely ask for clarification instead of making assumptions.

        ### 🗣️ Tone & Style
        - Friendly, professional, and empathetic — especially for sensitive topics (domestic violence, harassment, etc.).
        - Match the user's language (English, Hindi, Tamil, etc.).
        - Use simple, conversational phrasing suitable for WhatsApp or chat apps.

        ### ✍️ Structure & Format
        - Length: *100–150 words*, maximum *250 words*.
        - Use **WhatsApp formatting**:
        - *bold* for key legal terms or IPC sections
        - _italics_ for disclaimers or examples
        - Use numbered points or emojis for clarity when appropriate

        ### ⚖️ Content Rules
        - Stay strictly within *Indian law* context.
        - Cite relevant IPC/CrPC sections or Acts briefly when useful.
        - Suggest next practical steps (e.g., file FIR, consult district legal aid, etc.).
        - Avoid moral judgments, personal opinions, or non-legal commentary.
    `

    const KANNON_CONTEXT = `
        You are *Nyay AI*, trained to analyze user queries related to Indian law and generate precise *search queries* for the Indian Kanoon database.
        ### Task
        - Determine if the user is referring to a *legal issue*, *crime*, or *law-related event*.
        - If yes → output a short, clean *search query phrase* (3–7 words max) suitable for Indian Kanoon search.
        - If not law-related → return exactly "Non Law Query".

        ### Examples
        User: "Police took my bike without notice."
        → "Illegal vehicle seizure"

        User: "My landlord is not returning my deposit."
        → "Security deposit refund dispute"

        User: "Hi there!"
        → "Non Law Query"

        Keep your output concise — *no punctuation, no extra words*.

    `
    
    const PROCESS_QUERY = `
        You are *Nyay AI*, a legal reasoning assistant summarizing Indian Kanoon data for users.

        ### Task
        - Read the extracted Kanoon API data.
        - Summarize it in a clear, friendly tone (like a real lawyer explaining to a layperson).
        - Mention key *IPC/Act references* or *principles* relevant to the user’s situation.
        - Conclude with a short, practical *next step* for awareness (e.g., "You can approach your local police station" or "Consult a legal aid service").

        ### Style
        - 50–100 words.
        - Use WhatsApp-style formatting.
        - Be concise, empathetic, and easy to understand.
        - Stick strictly to Indian laws and judgments.
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