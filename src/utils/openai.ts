import { encode } from "gpt-token-utils";
// import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";
const { OpenAIClient, AzureKeyCredential, Configuration } = require("@azure/openai");
const { setLogLevel } = require("@azure/logger");
import { OpenAIExt } from "openai-ext";
import { db } from "../db";
import { config } from "./config";

setLogLevel("info");

// https://learn.microsoft.com/en-us/azure/ai-services/openai/use-your-data-quickstart?tabs=command-line%2Cpython&pivots=programming-language-javascript
// Set the Azure and AI Search values from environment variables
const endpoint = "https://smartfactory-gpt4.openai.azure.com/" //process.env["AOAIEndpoint"];
const azureApiKey = "" //process.env["AOAIKey"];
const searchEndpoint = "https://genaihackathonaisearch.search.windows.net" //process.env["SearchEndpoint"];
const searchKey = "" //process.env["SearchKey"];
const searchIndex = "disc" //process.env["SearchIndex"];
const deploymentId = "DISC" //process.env["AOAIDeploymentId"];

function getClient(
  apiKey: string,
  apiType: string,
  apiAuth: string,
  basePath: string
) {
  // const configuration = new Configuration({
  //   ...((apiType === "openai" ||
  //     (apiType === "custom" && apiAuth === "bearer-token")) && {
  //     apiKey: apiKey,
  //   }),
  //   ...(apiType === "custom" && { basePath: basePath }),
  // });

  // return new OpenAIApi(configuration);
  return new OpenAIClient(
    "https://smartfactory-gpt4.openai.azure.com/",
    new AzureKeyCredential(apiKey)
  )
}

export async function createStreamChatCompletion(
  apiKey: string,
  messages: any[],
  chatId: string,
  messageId: string
) {
  const settings = await db.settings.get("general");
  const model = settings?.openAiModel ?? config.defaultModel;

  // return OpenAIExt.streamClientChatCompletion(
  //   {
  //     model,
  //     messages,
  //   },
  //   {
  //     apiKey: apiKey,
  //     handler: {
  //       onContent(content, isFinal, stream) {
  //         setStreamContent(messageId, content, isFinal);
  //         if (isFinal) {
  //           setTotalTokens(chatId, content);
  //         }
  //       },
  //       onDone(stream) {},
  //       onError(error, stream) {
  //         console.error(error);
  //       },
  //     },
  //   }
  // );

  let client = new OpenAIClient(
    "https://smartfactory-gpt4.openai.azure.com/",
    new AzureKeyCredential(apiKey)
  );
  const events = await client.streamChatCompletions(deploymentId, messages, {
    azureExtensionOptions: {
      extensions: [
        {
          type: "AzureCognitiveSearch",
          endpoint: searchEndpoint,
          key: searchKey,
          indexName: searchIndex,
        },
      ],
    },
    maxTokens: 2048
  });
  let content = "";
  for await (const event of events) {
    // console.log("event:")
    // console.log(event);
    for (const choice of event.choices) {
      // console.log("choice:")
      // console.log(choice);
      const delta = choice.delta?.content;
      if (delta !== undefined) {
        // console.log(`Chatbot: ${delta}`);
        content += delta
        setStreamContent(messageId, content, false);
      }
    }
  }
  setTotalTokens(chatId, content);
}

function setStreamContent(
  messageId: string,
  content: string,
  isFinal: boolean
) {
  content = isFinal ? content : content + "█";
  db.messages.update(messageId, { content: content });
}

function setTotalTokens(chatId: string, content: string) {
  let total_tokens = encode(content).length;
  db.chats.where({ id: chatId }).modify((chat) => {
    if (chat.totalTokens) {
      chat.totalTokens += total_tokens;
    } else {
      chat.totalTokens = total_tokens;
    }
  });
}

export async function createChatCompletion(
  apiKey: string,
  messages: any[]
) {
  const settings = await db.settings.get("general");
  const model = settings?.openAiModel ?? config.defaultModel;
  const type = settings?.openAiApiType ?? config.defaultType;
  const auth = settings?.openAiApiAuth ?? config.defaultAuth;
  const base = settings?.openAiApiBase ?? config.defaultBase;
  const version = settings?.openAiApiVersion ?? config.defaultVersion;

  const client = getClient(apiKey, type, auth, base);
  // return client.createChatCompletion(
  //   {
  //     model,
  //     stream: false,
  //     messages,
  //   },
  //   {
  //     headers: {
  //       "Content-Type": "application/json",
  //       ...(type === "custom" && auth === "api-key" && { "api-key": apiKey }),
  //     },
  //     params: {
  //       ...(type === "custom" && { "api-version": version }),
  //     },
  //   }
  // );
  // return await client.streamChatCompletions(deploymentId, messages, { maxTokens: 128 });
  return {
    data: await client.getChatCompletions(deploymentId, messages, {
      azureExtensionOptions: {
        extensions: [
          {
            type: "AzureCognitiveSearch",
            endpoint: searchEndpoint,
            key: searchKey,
            indexName: searchIndex,
          },
        ],
      },
      maxTokens: 2048
    })
  };
}

export async function checkOpenAIKey(apiKey: string) {
  return createChatCompletion(apiKey, [
    {
      role: "user",
      content: "hello",
    },
  ]);
}
