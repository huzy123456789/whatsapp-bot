const fs = require("fs");
const { Client } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { OpenAI } = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const client = new Client({
  puppeteer: {
      headless: true,
      // executablePath: '/usr/bin/chromium-browser', // Use system Chrome
      args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
      ]
  }
});


let fileId;
let vectorStoreId;

// 1️⃣ Upload PDF at startup
async function uploadPDF() {
  const resp = await openai.files.create({
    file: fs.createReadStream("./faq.pdf"),
    purpose: "assistants",
  });
  fileId = resp.id;
  console.log("Uploaded PDF, fileId:", fileId);

  const vectorStore = await openai.vectorStores.create({
    name: "KnowledgeBaseStore",
    file_ids: [fileId],
  });
  vectorStoreId = vectorStore.id;
  console.log("Vector Store created, ID:", vectorStoreId);
}

// 2️⃣ Query via Responses API with file attachment
async function askPDF(question) {
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "user",
        content: [{
          type: "input_text",
          text: `Based on the attached document, please answer this question: ${question}

          IMPORTANT: Answer like a friendly customer service representative. Use the information from the document as your own knowledge, but:
          - Don't mention "the document says" or "according to the file"
          - Don't include file references or citations
          - Answer naturally and conversationally
          - Be warm and helpful
          - Keep it concise for WhatsApp
          - Present the information as if it's your personal expertise
          - if someone is asking a question in a different language then answer it in the same language as the question

          Question: ${question}`
                  }],
                },
              ],
              tools: [{ type: "file_search", vector_store_ids: [vectorStoreId] }],
            });

  console.log("RAW RESPONSE:", JSON.stringify(response, null, 2));

  return response.output_text || "I couldn't find anything in the PDF.";
}

  
  

// 3️⃣ WhatsApp message handling
client.on("qr", (qr) => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("WhatsApp ready!"));
client.on("message_create", async (msg) => {
  if (
    msg.fromMe ||
    msg.body === "" ||
    msg.body === undefined ||
    msg.body === null
  )
    return;
  try {
    const ans = await askPDF(msg.body);
    await msg.reply(ans);
  } catch (e) {
    console.error("Responses API error:", e);
    await msg.reply("Sorry, something went wrong processing your PDF request.");
  }
});

// 🏁 Initialize everything
(async () => {
  await uploadPDF();
  client.initialize();
})();
