import { errorMessage, MAX_MESSAGE_BYTES, parseReply, prepareRequest, utf8Bytes } from "./protocol.mjs";

type Message = { role: "user" | "assistant"; content: string };

class TutorialAssistant extends HTMLElement {
    private history: Message[] = [];
    private available = false;
    private busy = false;
    private checking = false;
    private epoch = 0;
    private listeners?: AbortController;
    private statusRequest?: AbortController;
    private chatRequest?: AbortController;
    private apiUrl = "";
    private question!: HTMLTextAreaElement;
    private send!: HTMLButtonElement;
    private newChat!: HTMLButtonElement;
    private recheck!: HTMLButtonElement;
    private status!: HTMLParagraphElement;
    private log!: HTMLDivElement;
    private welcome!: HTMLDivElement;
    private inputError!: HTMLParagraphElement;

    connectedCallback() {
        this.apiUrl = this.dataset.apiUrl ?? "";
        this.question = this.querySelector<HTMLTextAreaElement>("[data-question]")!;
        this.send = this.querySelector<HTMLButtonElement>("[data-send]")!;
        this.newChat = this.querySelector<HTMLButtonElement>("[data-new-chat]")!;
        this.recheck = this.querySelector<HTMLButtonElement>("[data-recheck]")!;
        this.status = this.querySelector<HTMLParagraphElement>("[data-status]")!;
        this.log = this.querySelector<HTMLDivElement>("[data-conversation]")!;
        this.welcome = this.querySelector<HTMLDivElement>("[data-welcome]")!;
        this.inputError = this.querySelector<HTMLParagraphElement>("[data-input-error]")!;
        this.listeners?.abort();
        this.listeners = new AbortController();
        const options = { signal: this.listeners.signal };
        // A page in the back-forward cache may never disconnect its elements.
        window.addEventListener("pagehide", () => this.stopAndClear(), options);
        window.addEventListener("pageshow", (event) => {
            if (!event.persisted) return;
            this.stopAndClear();
            if (this.apiUrl) void this.checkStatus();
        }, options);
        this.querySelector<HTMLFormElement>("[data-chat-form]")!.addEventListener("submit", (event) => {
            event.preventDefault();
            void this.submit();
        }, options);
        this.question.addEventListener("input", () => this.updateInput(), options);
        this.question.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
                event.preventDefault();
                if (!this.send.disabled) this.querySelector<HTMLFormElement>("form")!.requestSubmit();
            }
        }, options);
        this.recheck.addEventListener("click", () => void this.checkStatus(), options);
        this.newChat.addEventListener("click", () => {
            if (this.busy) return;
            this.clearConversation();
            this.updateInput();
            this.question.focus();
        }, options);
        this.querySelectorAll<HTMLButtonElement>("[data-example]").forEach((button) => {
            button.disabled = !this.apiUrl;
            button.addEventListener("click", () => {
                if (this.busy) return;
                this.question.value = button.textContent?.trim() ?? "";
                this.updateInput();
                this.question.focus();
            }, options);
        });
        this.updateInput();
        if (this.apiUrl) void this.checkStatus();
    }

    disconnectedCallback() {
        this.listeners?.abort();
        this.stopAndClear();
    }

    private clearConversation() {
        this.history = [];
        this.log.querySelectorAll(".chat-message").forEach((message) => message.remove());
        this.welcome.hidden = false;
        this.question.value = "";
        this.inputError.hidden = true;
        this.inputError.textContent = "";
    }

    private stopAndClear() {
        this.epoch++;
        this.statusRequest?.abort();
        this.chatRequest?.abort();
        this.busy = false;
        this.checking = false;
        this.available = false;
        this.clearConversation();
        this.status.textContent = this.apiUrl ? "已清空对话，重新检查后可继续提问。" : "本站已关闭模型问答，教程仍可阅读。";
        this.updateInput();
    }

    private updateInput() {
        const size = utf8Bytes(this.question.value.trim());
        this.querySelector<HTMLElement>("[data-byte-count]")!.textContent = `${size} / ${MAX_MESSAGE_BYTES} 字节`;
        this.inputError.hidden = size <= MAX_MESSAGE_BYTES;
        this.inputError.textContent = size > MAX_MESSAGE_BYTES ? "问题过长，请缩短内容。中文通常每字占 3 个 UTF-8 字节。" : "";
        this.send.disabled = !this.available || this.busy || size === 0 || size > MAX_MESSAGE_BYTES;
        this.send.textContent = this.busy ? "正在回答……" : "发送问题";
        this.newChat.disabled = this.busy;
        this.recheck.disabled = !this.apiUrl || this.checking || this.busy;
        this.question.readOnly = this.busy;
        this.querySelectorAll<HTMLButtonElement>("[data-example]").forEach((button) => { button.disabled = !this.apiUrl || this.busy; });
        this.log.setAttribute("aria-busy", String(this.busy));
    }

    private async checkStatus() {
        if (!this.apiUrl || this.checking || this.busy) return;
        const epoch = this.epoch;
        const controller = new AbortController();
        this.statusRequest = controller;
        this.checking = true;
        this.available = false;
        this.status.textContent = "正在检查问答服务……";
        this.updateInput();
        const timeout = window.setTimeout(() => controller.abort(), 15_000);
        try {
            const response = await fetch(`${this.apiUrl}/api/chat/status`, {
                signal: controller.signal, cache: "no-store", credentials: "omit", redirect: "error",
            });
            const data: unknown = await response.json();
            if (!this.isConnected || epoch !== this.epoch) return;
            this.available = response.ok && !!data && typeof data === "object" && "available" in data && data.available === true;
            this.status.textContent = this.available
                ? "问答服务可用，与教程革命共用预算。"
                : errorMessage(data);
        } catch {
            if (!this.isConnected || epoch !== this.epoch) return;
            this.available = false;
            this.status.textContent = "暂时无法连接问答服务，请点击“重新检查”。本站教程仍可阅读。";
        } finally {
            window.clearTimeout(timeout);
            if (this.isConnected && epoch === this.epoch) {
                this.checking = false;
                this.updateInput();
            }
        }
    }

    private addMessage(role: "user" | "assistant", content: string) {
        this.welcome.hidden = true;
        const article = document.createElement("article");
        article.className = "chat-message";
        article.dataset.role = role;
        const label = document.createElement("p");
        label.className = "message-label";
        label.textContent = role === "user" ? "你" : "教程助教";
        const text = document.createElement("p");
        text.className = "message-text";
        text.textContent = content;
        article.append(label, text);
        this.log.append(article);
        this.log.scrollTop = this.log.scrollHeight;
        return { article, text };
    }

    private async submit() {
        if (!this.available || this.busy || !this.apiUrl) return;
        const message = this.question.value.trim();
        let body: string;
        let requestId: string;
        try {
            body = prepareRequest(message, this.history);
            requestId = crypto.randomUUID();
        } catch (error) {
            this.inputError.hidden = false;
            this.inputError.textContent = error instanceof Error ? error.message : "无法准备问题，请缩短内容。";
            return;
        }
        const epoch = this.epoch;
        const controller = new AbortController();
        this.chatRequest = controller;
        this.busy = true;
        this.addMessage("user", message);
        const pending = this.addMessage("assistant", "正在思考，复杂问题可能需要一两分钟……");
        this.question.value = "";
        this.updateInput();
        const timeout = window.setTimeout(() => controller.abort(), 130_000);
        try {
            const response = await fetch(`${this.apiUrl}/api/chat`, {
                method: "POST", credentials: "omit", redirect: "error", signal: controller.signal,
                headers: { "Content-Type": "application/json", "Idempotency-Key": requestId }, body,
            });
            const data: unknown = await response.json().catch(() => {
                throw new Error("服务返回了无法识别的响应，无法确认本次调用是否完成。本页不会自动重发，请稍后检查服务状态。");
            });
            if (!this.isConnected || epoch !== this.epoch) return;
            if (!response.ok) throw new Error(errorMessage(data));
            const reply = parseReply(data);
            pending.text.textContent = reply.content;
            if (reply.sources.length) {
                const sources = document.createElement("nav");
                sources.className = "message-sources";
                sources.setAttribute("aria-label", "本条回答的教程来源");
                for (const source of reply.sources) {
                    const link = document.createElement("a");
                    link.textContent = `${source.title}（教程革命）`;
                    link.href = source.href;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    sources.append(link);
                }
                pending.article.append(sources);
            }
            this.history.push({ role: "user", content: message }, { role: "assistant", content: reply.content });
            this.log.scrollTop = pending.article.offsetTop - this.log.offsetTop;
        } catch (error) {
            if (!this.isConnected || epoch !== this.epoch) return;
            this.available = false;
            pending.article.dataset.error = "true";
            pending.text.textContent = error instanceof TypeError || controller.signal.aborted
                ? "连接中断或等待超时，无法确认本次调用是否完成，也无法确认最终费用。本页不会自动重发或续写，请稍后重新检查服务状态。"
                : error instanceof Error ? error.message : "问答暂不可用，本页没有自动重试。";
            this.status.textContent = "本次未能取得完整答案。请重新检查服务状态，教程仍可阅读。";
        } finally {
            window.clearTimeout(timeout);
            if (this.isConnected && epoch === this.epoch) {
                this.busy = false;
                this.updateInput();
            }
        }
    }
}

if (!customElements.get("tutorial-assistant")) customElements.define("tutorial-assistant", TutorialAssistant);
