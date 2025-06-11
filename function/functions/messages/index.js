const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const { OpenAIClient, AzureKeyCredential: AIKeyCred } = require('@azure/openai');

// Inicializa clientes con las variables de entorno configuradas en Azure
const searchClient = new SearchClient(
  process.env.SEARCH_ENDPOINT,
  process.env.SEARCH_INDEX,
  new AzureKeyCredential(process.env.SEARCH_API_KEY)
);
const openaiClient = new OpenAIClient(
  process.env.AZ_OPENAI_ENDPOINT,
  new AIKeyCred(process.env.AZ_OPENAI_KEY)
);

module.exports = async function (context, req) {
  const userMessage = req.body?.text || '';
  context.log(`Mensaje recibido: ${userMessage}`);

  // 1) Generar embedding de la pregunta
  const embedRes = await openaiClient.getEmbeddings('text-embedding-3-small', [userMessage]);
  const questionEmbedding = embedRes[0].embedding;

  // 2) Recuperar los chunks más relevantes desde Azure AI Search
  const searchResults = searchClient.search('*', {
    vector: questionEmbedding,
    vectorFields: 'text_vector',
    top: 5
  });
  const chunks = [];
  for await (const r of searchResults.results) {
    chunks.push(r.document.chunk);
  }

  // 3) Construir el prompt para OpenAI
  const messages = [
    { role: 'system', content: 'Eres el asistente interno de UDONi. Responde SOLO con información de los documentos indexados, en español.' },
    { role: 'user', content: userMessage },
    { role: 'assistant', content: chunks.join('\n---\n') }
  ];
  const completion = await openaiClient.getChatCompletions('gpt-4o', { messages });
  const answer = completion.choices[0].message?.content || 'Lo siento, no encontré información.';

  // 4) Devolver la respuesta al canal Web Chat
  context.res = {
    status: 200,
    body: {
      type: 'message',
      text: answer
    }
  };
};
