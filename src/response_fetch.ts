import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import "dotenv/config"; 
const google_api = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: `${google_api}`});


async function getResponse(text:string,history:string | never[]):Promise<string | undefined>{

    const contents = [
        {
            role: "model",
            parts: [{text: process.env.KANNON_CONTEXT ?? ""}]
        },
        {
            role: "user",
            parts: [{text: (history ?? "") + "\n" + (text ?? "")}]
        }
    ];

    const response = await ai.models.generateContent({model: "gemini-2.5-flash",contents});
    const rsp = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!rsp) return "Sorry, I couldn’t process your question.";
    if(rsp === "Non Law Query"){
        const contents = [
            {
                role:"model",
                parts : [{text:  process.env.SYSTEM_PROMPT +"\n"+ (history ?? "")}]
            },
            {
                role:"user",
                parts : [{text}]
            },
        ];

        const response = await ai.models.generateContent({model: "gemini-2.5-flash",contents});
        return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    }

    // law query
    const rsp_tailored = encodeURIComponent(rsp)
    const fetch_query = await axios.post(`https://api.indiankanoon.org/search/?formInput=${rsp_tailored}`,
        {},
        {
            headers: {Authorization: `Token ${process.env.INDIAN_KANOON_API_KEY}`}
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

export {getResponse}