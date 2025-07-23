const fs = require("fs");
const { Client } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey:
    "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",
});
const client = new Client();


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
          content: [{ type: "input_text", text: question }],
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
