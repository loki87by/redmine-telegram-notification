import TelegramBot from "node-telegram-bot-api";
import axios, { AxiosResponse } from "axios";
import { Issue, IssueContent, Journal } from "./types";
import "dotenv/config";

const { TELEGRAM_BOT_TOKEN, CHAT_ID, REDMINE_API_KEY, BASE_URL } = process.env;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN as string, { polling: false });
const request = `${BASE_URL}/issues.json?key=${REDMINE_API_KEY}&status_id!=5`;
const ignored = [71060];

let currentIssuesList: Issue[] = [];

const dateChecker = () => {
  const date = Date.now();
  const newDate = new Date(date);
  const day = newDate.getDay();
  const hour = newDate.getHours();

  if (day > 0 && day < 6 && hour < 20 && hour > 8) {
    return true;
  } else {
    return false;
  }
};

const ignoreFilter = (issue: Issue) => {
  if (ignored.includes(issue.id as number)) {
    return false;
  }
  return true;
};

function checkNotes(issue: Issue): void {
  getCurrentIssuesJournal(issue.id as number).then((res: void | Issue) => {
    const issueWithJornals = res;
    if ((issueWithJornals as unknown as Issue).journals) {
      const lastComment = (
        (issueWithJornals as unknown as Issue).journals as Journal[]
      ).sort((a, b) => {
        return (a.id as number) - (b.id as number);
      })[
        ((issueWithJornals as unknown as Issue).journals as Journal[]).length -
          1
      ];
      if ((lastComment.notes as string).length > 0) {
        const message: string = `В задаче #${issue.id}${
          (issue.assigned_to as unknown as IssueContent).name &&
          (issue.assigned_to as unknown as IssueContent).name !== ""
            ? " (" + (issue.assigned_to as unknown as IssueContent).name + ") "
            : ""
        } добавлен комментарий: ${lastComment.notes}\n${BASE_URL}/issues/${
          issue.id
        }`;
        bot.sendMessage(CHAT_ID as string, message);
      }
    } else {
      notifyIssueUpdate(issue);
    }
  });
}

async function initializeCurrentIssuesList(): Promise<void> {
  try {
    const response: AxiosResponse = await axios.get(request);
    currentIssuesList = response.data.issues;
  } catch (error) {
    console.error("Ошибка при инициализации списка задач из Redmine:", error);
  }
}

async function getCurrentIssuesJournal(id: number): Promise<Issue | void> {
  const req = `${BASE_URL}/issues/${id}.json?include=journals&key=${REDMINE_API_KEY}`;
  try {
    const response: AxiosResponse = await axios.get(req);
    return response.data.issue;
  } catch (error) {
    console.error("Ошибка при получении журналов", error);
  }
}

async function getRedmineUpdatesAndNotify(): Promise<void> {
  try {
    const response: AxiosResponse = await axios.get(request);
    const newIssuesList = response.data.issues;

    if (JSON.stringify(currentIssuesList) !== JSON.stringify(newIssuesList)) {
      // Обнаружены изменения
      newIssuesList.forEach((issue: Issue) => {
        if (dateChecker() && ignoreFilter(issue)) {
          if (
            !currentIssuesList.some(
              (currentIssue) => currentIssue.id === issue.id
            )
          ) {
            notifyNewIssue(issue);
          } else {
            const currentIssue = currentIssuesList.find(
              (currentIssue) => currentIssue.id === issue.id
            );

            if (
              ((currentIssue as Issue).status as unknown as IssueContent)
                .name !==
              ((issue as Issue).status as unknown as IssueContent).name
            ) {
              notifyStatusUpdate(
                issue,
                ((currentIssue as Issue).status as unknown as IssueContent)
                  .name,
                (issue.assigned_to as unknown as IssueContent).name
              );
            } else if (
              (currentIssue as Issue).updated_on !== issue.updated_on
            ) {
              checkNotes(currentIssue as Issue);
            }
          }
        }
      });
      currentIssuesList = newIssuesList;
    }
  } catch (error) {
    console.error("Ошибка при получении обновлений из Redmine:", error);
  }
}

function notifyNewIssue(issue: Issue): void {
  const message: string = `Добавлена задача #${issue.id}${
    (issue.assigned_to as unknown as IssueContent).name &&
    (issue.assigned_to as unknown as IssueContent).name !== ""
      ? " для " + (issue.assigned_to as unknown as IssueContent).name + " "
      : ""
  } - ${issue.subject}\n${BASE_URL}/issues/${issue.id}`;
  const status = (issue.priority as unknown as IssueContent).id;
  if (status === 3) {
    bot.sendMessage(CHAT_ID as string, "\u{1F7E2}" + message + "\u{1F7E2}", {
      parse_mode: "HTML",
    });
  } else if (status === 4) {
    bot.sendMessage(CHAT_ID as string, "\u{1F7E1}" + message + "\u{1F7E1}", {
      parse_mode: "HTML",
    });
  } else if (status === 5) {
    bot.sendMessage(CHAT_ID as string, "\u{1F534}" + message + "\u{1F534}", {
      parse_mode: "HTML",
    });
  } else {
    bot.sendMessage(CHAT_ID as string, message);
  }
}

function notifyStatusUpdate(
  issue: Issue,
  oldStatus: string,
  appointed: string
): void {
  const message: string = `${
    (issue.status as unknown as IssueContent).id === 1 ? "<u>" : ""
  }В задаче #${issue.id}${
    appointed ? " (" + appointed + ") " : ""
  } изменён статус с: "${oldStatus}" на "${
    (issue.status as unknown as IssueContent).name
  }"${
    (issue.status as unknown as IssueContent).id === 1 ? "</u>" : ""
  }\n${BASE_URL}/issues/${issue.id}`;
  bot.sendMessage(CHAT_ID as string, message);
}

function notifyIssueUpdate(issue: Issue): void {
  const message: string = `Обновление в задаче #${issue.id}${
    (issue.assigned_to as unknown as IssueContent).name &&
    (issue.assigned_to as unknown as IssueContent).name !== ""
      ? " (" + (issue.assigned_to as unknown as IssueContent).name + ") "
      : ""
  }\n${BASE_URL}/issues/${issue.id}`;
  bot.sendMessage(CHAT_ID as string, message);
}

initializeCurrentIssuesList().then(() => {
  setInterval(getRedmineUpdatesAndNotify, 60000);
  console.log("Бот запущен. Ожидание обновлений из Redmine.");
  bot.sendMessage(CHAT_ID as string, "Бот успешно запущен и готов к работе!");
  dateChecker();
});
