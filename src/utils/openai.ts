import { encode } from "gpt-token-utils";
// import { ChatCompletionRequestMessage, Configuration, OpenAIApi } from "openai";
const { OpenAIClient, AzureKeyCredential, Configuration } = require("@azure/openai");
const { setLogLevel } = require("@azure/logger");
import { OpenAIExt } from "openai-ext";
import { db } from "../db";
import { config } from "./config";
import pptxgen from "pptxgenjs";

setLogLevel("info");

// https://learn.microsoft.com/en-us/azure/ai-services/openai/use-your-data-quickstart?tabs=command-line%2Cpython&pivots=programming-language-javascript
// Set the Azure and AI Search values from environment variables
const endpoint = "https://smartfactory-gpt4.openai.azure.com/" //process.env["AOAIEndpoint"];
// const azureApiKey = "" //process.env["AOAIKey"];
// const searchEndpoint = "https://genaihackathonaisearch.search.windows.net" //process.env["SearchEndpoint"];
// const searchKey = "fN5SNhCRnmhsZgZnVxfmkmzUzW6V57ff4NOQi7VSrcAzSeA2fzCu" //process.env["SearchKey"];
// const searchIndex = "disc" //process.env["SearchIndex"];
const deploymentId = "DISC" //process.env["AOAIDeploymentId"];

function getClient(
  apiKey: string,
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
    basePath,
    new AzureKeyCredential(apiKey)
  )
}

export async function createStreamChatCompletion(
  apiKey: string,
  messages: any[],
  chatId: string,
  messageId: string,
  searchEndpoint: string | undefined,
  searchKey: string | undefined,
  searchIndex: string | undefined,
  roleInformation: string | undefined
) {
  const settings = await db.settings.get("general");
  const model = settings?.openAiModel ?? config.defaultModel;

  let client = getClient(apiKey, endpoint);
  let chatCompletionsOptions: any = {
    maxTokens: 2048
  }
  if (searchIndex) {
    chatCompletionsOptions["azureExtensionOptions"] = {
      "extensions": [
        {
          "type": "AzureCognitiveSearch",
          "endpoint": searchEndpoint,
          "key": searchKey,
          "indexName": searchIndex,
          "semanticConfiguration": "default",
          "queryType": "vectorSemanticHybrid",
          "fieldsMapping": {
            "contentFieldsSeparator": "\n",
            "contentFields": [
              "content"
            ],
            "filepathField": "filepath",
            "titleField": "title",
            "urlField": "url",
            "vectorFields": [
              "contentVector"
            ]
          },
          "embeddingDeploymentName": "text-embedding-ada-002",
          "inScope": true,
          "roleInformation": roleInformation
        },
      ],
    }
  }
  const events = await client.streamChatCompletions(deploymentId, messages, chatCompletionsOptions);
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
  setStreamContent(messageId, content, true);
  setTotalTokens(chatId, content);

  // console.log('Final Content:')
  // console.log(content)

  if (content) {
    // Create presentation
    let pres = new pptxgen()
    let slide: any = null
    let textRows: any = [];
    let title_textboxOpts = { x: 0.1, y: 0.3, fontSize: 24, color: "363636", bold: true };
    let text_textboxOpts = { x: 0.1, y: 0.65, fontSize: 11, color: "363636" };
    content.split('\n').forEach(ppt_line => {
      console.log(ppt_line)

      if (ppt_line.startsWith('Slide ')) {
        if (slide) {
          slide.addTable(JSON.parse(JSON.stringify(textRows)), text_textboxOpts);
        }
        slide = pres.addSlide()
        textRows = []
      } else if (ppt_line.startsWith('**Slide ')) {
        if (slide) {
          slide.addTable(JSON.parse(JSON.stringify(textRows)), text_textboxOpts);
        }
        slide = pres.addSlide()
        textRows = []
        let titleText = ppt_line.replaceAll('**', '')
        slide.addText(titleText, title_textboxOpts);
      } else if (ppt_line.startsWith('Title:') && slide) {
        let titleText = ppt_line.replace('Title: ', '')
        slide.addText(titleText, title_textboxOpts);
      } else if (slide) {
        ppt_line = ppt_line.trim()
        let firstChar = ''
        if (ppt_line != '') {
          firstChar = ppt_line.charAt(0)
        }

        if (/^\d+$/.test(firstChar) || firstChar == '-') {
          textRows.push([{
            text: ppt_line,
            options: { bullet: false, indentLevel: 1 }
          }])
        } else {
          textRows.push([{
            text: ppt_line,
            options: { bullet: false }
          }])
        }

        
      }
    })
    if (slide) {
      slide.addTable(JSON.parse(JSON.stringify(textRows)), text_textboxOpts);
    }

    if (slide) {
      pres.writeFile();
    }
  }
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

  const client = getClient(apiKey, endpoint);
  return {
    data: await client.getChatCompletions(deploymentId, messages, {
      maxTokens: 128
    })
  };
}

export async function checkOpenAIKey(apiKey: string) {
  return createChatCompletion(apiKey, [
    {
      role: "user",
      content: "Hello",
    },
  ]);
}
