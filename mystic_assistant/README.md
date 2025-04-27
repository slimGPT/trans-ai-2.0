# Mystic Assistant

A simple Python-based mystic assistant widget that provides a ritual-like experience for communicating with a virtual mystic entity.

## Features

- FastAPI backend that securely handles GPT-4 communication
- Vosk for local voice-to-text transcription in French
- Simple HTML/JS frontend with a minimalist design
- Single button interface to enter trance, record, transcribe, and receive mystical messages

## Setup

1. **Create a virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Download Vosk French model:**
   - Download the small French model from https://alphacephei.com/vosk/models
   - Extract the model to the `models` directory and rename it to `vosk-model-small-fr-0.22`

4. **Set up environment variables:**
   - Copy `env.example` to `.env`
   - Add your OpenAI API key to the `.env` file

5. **Run the application:**
   ```bash
   uvicorn main:app --reload
   ```

6. **Access the application:**
   - Open your browser and navigate to `http://localhost:8000`

## Usage

1. Click "Entrer en transe" to start recording
2. Speak your question or thoughts in French
3. Recording will automatically stop after 3 minutes, or click the button again to stop earlier
4. The system will transcribe your speech, send it to GPT-4, and display the mystic response

## Project Structure

```
/mystic_assistant
│
├── main.py                 # FastAPI app
├── vosk_transcriber.py     # Handles local STT with Vosk
├── prompt_config.py        # Stores GPT system prompt
├── requirements.txt        # Python dependencies
├── env.example             # Environment variables template
├── /templates
│   └── index.html          # Frontend UI
├── /static
│   └── script.js           # JS to control recording
└── /models                 # Directory for Vosk models
```

## Requirements

- Python 3.8 or higher
- Internet connection for GPT-4 API calls
- Microphone for audio recording 