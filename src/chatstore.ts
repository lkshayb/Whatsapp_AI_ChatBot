type Msg = { 
    role: "user" | "model"; 
    text: string | undefined; 
    time: number 
};

const store = new Map<string, Msg[]>();

function appendMessage(userId: string, msg: Msg) {    
    const arr = store.get(userId) ?? [];
    arr.push(msg);
    store.set(userId, arr);
}

function getHistory(userId: string){
    const contents: { role: string; parts: { text: string | undefined }[] }[] = [];
    const editmap= store.get(userId) ?? [];
    for (const value of editmap) { 
        contents.push({
            role: value.role,
            parts: [{ text: value.text }]
        });
    }

    return JSON.stringify(contents, null, 2)
}

export {appendMessage,getHistory}
