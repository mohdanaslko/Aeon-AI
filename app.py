import os
import traceback
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles
import uvicorn
# LangChain Imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# ── Startup check — catch missing API key immediately ───────────
if not GEMINI_API_KEY:
    raise RuntimeError("❌ GEMINI_API_KEY not found. Check your .env file.")

print(f"✅ GEMINI_API_KEY loaded: {GEMINI_API_KEY[:8]}...")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
app = FastAPI(title="Gemini Memory API")


# ── CORS ────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
# ── Serve frontend files ─────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

@app.api_route("/", methods=["GET", "HEAD"])
async def serve_frontend():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


# ── LangChain Setup ──────────────────────────────────────────────
model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.7,
    google_api_key=GEMINI_API_KEY,
    top_p=0.9,
    top_k=40,
)

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful AI Assistant. Remember the user's name and previous context."),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{input}")
])

chain = prompt | model

store = {}

def get_session_history(session_id: str):
    if session_id not in store:
        store[session_id] = ChatMessageHistory()
    return store[session_id]

with_message_history = RunnableWithMessageHistory(
    chain,
    get_session_history,
    input_messages_key="input",
    history_messages_key="chat_history",
)

# ── Request Model ────────────────────────────────────────────────

class ChatRequest(BaseModel):
    user_id: str
    message: str

# ── Endpoints ────────────────────────────────────────────────────

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        print(f"📨 [{request.user_id}] {request.message}")
        config = {"configurable": {"session_id": request.user_id}}
        response = with_message_history.invoke(
            {"input": request.message},
            config=config
        )
        print(f"🤖 Response OK — {len(response.content)} chars")
        return {
            "user_id": request.user_id,
            "response": response.content
        }
    except Exception as e:
        traceback.print_exc()  # shows full error in your terminal
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/ping")
def ping():
    return {"status": "awake"}
@app.get("/sessions")
async def list_sessions():
    return {"sessions": list(store.keys())}


