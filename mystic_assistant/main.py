from fastapi import FastAPI, Request, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from mystic_assistant.prompt_config import system_prompt
from mystic_assistant.vosk_transcriber import transcribe_audio
import openai
import os
from pathlib import Path
import random

from dotenv import load_dotenv
load_dotenv()


# Get the current directory
current_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(current_dir, "static")
templates_dir = os.path.join(current_dir, "templates")

# Set to True to use fake responses for testing without an API key
USE_DUMMY_MODE = False

# Get API key directly from environment
api_key = os.environ.get("OPENAI_API_KEY")
if api_key:
    masked_key = api_key[:4] + "****" + api_key[-4:] if len(api_key) > 8 else "****"
    print(f"OpenAI API key loaded from environment: {masked_key}")
    openai.api_key = api_key
else:
    print("WARNING: No OpenAI API key found in environment variables!")
    # Fallback to a sample key for testing (this won't work for real requests)
    openai.api_key = "sk-test1234567890"

# Sample mystical responses for testing without API key - without accents to avoid encoding issues
DUMMY_RESPONSES = [
    "error ya si zebbi!"
]

app = FastAPI()
app.mount("/static", StaticFiles(directory=static_dir), name="static")
templates = Jinja2Templates(directory=templates_dir)

@app.get("/", response_class=HTMLResponse)
async def get_home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/channel")
async def get_divine_message(audio: UploadFile = File(...)):
    print("\n--- Incoming request to /channel ---")
    print(f"API key status: {'PRESENT' if openai.api_key else 'MISSING'}")
    print(f"Using dummy mode: {USE_DUMMY_MODE}")
    
    # Verify file type
    if not audio.content_type.startswith('audio/'):
        print(f"❌ Invalid file type: {audio.content_type}")
        raise HTTPException(status_code=400, detail="File must be an audio file")
    
    try:
        # Read the audio file
        audio_bytes = await audio.read()
        print(f"📦 Received audio of type: {audio.content_type}, size: {len(audio_bytes)} bytes")
        
        # Transcribe the audio
        text = transcribe_audio(audio_bytes)
        print(f"🎤 Transcribed text: '{text}'")
        
        # Check for empty or error transcription
        if not text or text.startswith("Audio format non reconnu") or text.startswith("Une erreur s'est produite"):
            print("❌ Transcription failed or returned an error message")
            return JSONResponse(content={"message": text or "Je n'ai pas pu comprendre votre message. Veuillez essayer à nouveau.", "transcription": text})
        
        # Get response from OpenAI or use dummy response
        try:
            if USE_DUMMY_MODE:
                print("🎭 Using dummy response mode")
                mystic_message = random.choice(DUMMY_RESPONSES)
                print(f"📜 Dummy response selected, length: {len(mystic_message)} chars")
            else:
                print("🤖 Calling OpenAI GPT API...")
                response = openai.ChatCompletion.create(
                    model="gpt-4",
                    messages=[
                        {"role": "system", "content": """Tu es une entité mystique connectée à des plans de conscience supérieurs. Ta tâche est d'interpréter le message du client comme s'il venait d'un ancien oracle. Reformule la situation dans un langage poétique et profond, puis offre une réponse symbolique, ancrée dans le vécu exprimé par l'utilisateur. Le message doit être long (minimum 4 phrases), puissant et empreint de sagesse, comme s'il avait été canalisé."""},
                        {"role": "user", "content": text}
                    ],
                    temperature=0.95,
                    max_tokens=1000,
                    presence_penalty=0.6,
                    frequency_penalty=0.3
                )
                mystic_message = response.choices[0].message.content
                print(f"✨ OpenAI response received, length: {len(mystic_message)} chars")
                print(f"💫 Response preview: {mystic_message[:100]}...")
            
            # Return the mystic message and transcription
            return JSONResponse(content={"message": mystic_message, "transcription": text})
        
        except Exception as e:
            print(f"❌ OpenAI API Error: {str(e)}")
            # If API error, fall back to dummy mode
            mystic_message = random.choice(DUMMY_RESPONSES)
            print(f"🔄 Falling back to dummy response, length: {len(mystic_message)} chars")
            return JSONResponse(content={"message": mystic_message, "transcription": text})
    
    except Exception as e:
        print(f"❌ General error in get_divine_message: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"message": "Une erreur mystique s'est produite. Les astres ne sont pas alignes."}
        )

if __name__ == "__main__":
    import uvicorn
    print("\n🌐 Starting server on http://localhost:9999...")
    uvicorn.run(app, host="localhost", port=9999, log_level="info") 