const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");

let resourceName = "smartfactory-gpt4";
let deploymentId = "Gpt-4";
const messages = [
    { role: "user", content: "What is DISC?" },
];

(async () => {
    try {
        const client = new OpenAIClient(`https://${resourceName}.openai.azure.com/`, new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY));

        const events = await client.streamChatCompletions(deploymentId, messages, {
            maxTokens: 8,
            azureExtensionOptions: {
                extensions: [
                    {
                        type: "AzureCognitiveSearch",
                        endpoint: "https://genaihackathonaisearch.privatelink.search.windows.net",
                        key: process.env.AZURE_AI_SEARCH_KEY,
                        indexName: "disc",
                    },
                ],
            },
        });
        let response = ""
        for await (const event of events) {
            for (const choice of event.choices) {
                const delta = choice.delta?.content;
                if (delta !== undefined) {
                    response += delta;
                }
            }
        }
        console.log(`Chatbot: ${response}`)
    } catch (err) {
        console.error("An error occurred:", err);
    }
})();