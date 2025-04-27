import wave
import json
from vosk import Model, KaldiRecognizer
import os
import tempfile
import io
import struct
import numpy as np
from tqdm import tqdm
import subprocess
import shutil
from pathlib import Path

# Use absolute path to the model directory
model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "vosk-model-fr-0.22")
print(f"\n📂 Loading Vosk model from: {model_path}")
model = Model(model_path)  # Use absolute path to ensure model is found
print("✅ Model loaded successfully")

def create_wav_header(sample_rate=16000, bits_per_sample=16, channels=1, data_size=None):
    """Generate a basic WAV header for raw PCM data."""
    if data_size is None:
        data_size = 2000000000  # Just a large number for streaming
    
    o = bytes("RIFF", 'ascii')  # (4 bytes) Marks file as RIFF
    o += struct.pack('<I', data_size + 36)  # (4 bytes) File size in bytes excluding this and RIFF marker
    o += bytes("WAVE", 'ascii')  # (4 bytes) File type
    o += bytes("fmt ", 'ascii')  # (4 bytes) Format Chunk Marker
    o += struct.pack('<I', 16)  # (4 bytes) Length of above format data
    o += struct.pack('<H', 1)  # (2 bytes) Format type (1 - PCM)
    o += struct.pack('<H', channels)  # (2 bytes) Channels
    o += struct.pack('<I', sample_rate)  # (4 bytes) Sample Rate
    o += struct.pack('<I', sample_rate * channels * bits_per_sample // 8)  # (4 bytes) Bytes per second
    o += struct.pack('<H', channels * bits_per_sample // 8)  # (2 bytes) Bytes per sample
    o += struct.pack('<H', bits_per_sample)  # (2 bytes) Bits per sample
    o += bytes("data", 'ascii')  # (4 bytes) Data Chunk Marker
    o += struct.pack('<I', data_size)  # (4 bytes) Data size in bytes
    return o

def process_webm_audio(audio_bytes):
    """Process WebM audio data to extract PCM data."""
    try:
        # WebM header is variable length, but starts with a specific signature
        if audio_bytes[:4] == b'\x1aE\xdf\xa3':
            print("\n🔄 WebM format detected, processing audio data...")
            
            # Convert to numpy array for processing
            # Skip WebM header (first 4KB to be safe)
            pcm_data = audio_bytes[4096:]
            
            # Convert bytes to 16-bit integers
            audio_array = np.frombuffer(pcm_data, dtype=np.int16)
            
            # Normalize audio levels with progress bar
            if len(audio_array) > 0:
                print("📊 Normalizing audio levels...")
                with tqdm(total=1, desc="Normalizing", unit="pass", colour="green") as pbar:
                    # Scale to 16-bit range
                    max_value = np.abs(audio_array).max()
                    if max_value > 0:
                        scale = 32767 / max_value
                        audio_array = (audio_array * scale).astype(np.int16)
                    pbar.update(1)
            
            print(f"✅ Processed audio: {len(audio_array)} samples")
            
            # Convert back to bytes
            processed_data = audio_array.tobytes()
            print(f"📦 Final PCM size: {len(processed_data)} bytes")
            
            return processed_data
        
        return audio_bytes
    except Exception as e:
        print(f"❌ Error in process_webm_audio: {str(e)}")
        return audio_bytes

def get_ffmpeg_path():
    """Get the path to the local FFmpeg installation."""
    local_ffmpeg = Path("ffmpeg/bin/ffmpeg.exe")
    if local_ffmpeg.exists():
        return str(local_ffmpeg)
    return "ffmpeg"  # Fallback to system FFmpeg if available

def convert_to_wav(input_bytes, input_format='webm'):
    """Convert audio bytes to WAV format using FFmpeg."""
    try:
        # Always save input file for inspection
        input_path = 'temp_input.webm'
        with open(input_path, 'wb') as f:
            f.write(input_bytes)
        print(f"📥 Saved input audio to {input_path} ({len(input_bytes)} bytes)")

        # Define output path
        output_path = 'temp_output.wav'
        
        # Convert using FFmpeg
        ffmpeg_path = get_ffmpeg_path()
        cmd = [
            ffmpeg_path,
            '-i', input_path,
            '-ac', '1',  # Mono
            '-ar', '16000',  # 16kHz sample rate
            '-acodec', 'pcm_s16le',  # 16-bit PCM
            '-y',  # Overwrite output file
            output_path
        ]
        
        print(f"\n🔄 Running FFmpeg command:")
        print(' '.join(cmd))
        
        process = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Always log FFmpeg output
        print("\n📝 FFmpeg output:")
        print(process.stderr)
        
        if process.returncode != 0:
            print(f"❌ FFmpeg conversion failed with error:\n{process.stderr}")
            raise Exception(f"FFmpeg conversion failed: {process.stderr}")
        
        # Verify output file exists and has reasonable size
        if not os.path.exists(output_path):
            raise Exception("FFmpeg output file not created")
        
        file_size = os.path.getsize(output_path)
        if file_size < 1024:  # Less than 1KB
            raise Exception(f"Output WAV file too small: {file_size} bytes")
        
        print(f"✅ FFmpeg conversion completed")
        print(f"📦 Output file: {output_path} ({file_size} bytes)")
        
        # Read the converted WAV file
        with open(output_path, 'rb') as f:
            wav_bytes = f.read()
        
        return wav_bytes
            
    except Exception as e:
        print(f"❌ Error in convert_to_wav: {str(e)}")
        raise  # Re-raise the exception to prevent transcription attempt

def transcribe_audio(audio_bytes):
    """
    Transcribe audio bytes using Vosk.
    Handles WAV format directly.
    """
    temp_wav = None
    try:
        # Convert input audio to WAV format
        wav_bytes = convert_to_wav(audio_bytes)
        # Create a temporary WAV file
        temp_wav = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        temp_wav.write(wav_bytes)
        temp_wav.flush()
        audio_path = temp_wav.name
        # Debug logs for diagnosis
        print("Model loaded:", model is not None)
        print("Audio file exists:", os.path.exists(audio_path))
        print("Audio file size:", os.path.getsize(audio_path))
        # Open the WAV file for reading
        wf = wave.open(audio_path, "rb")
        # Check if the audio format is supported
        if wf.getnchannels() != 1 or wf.getsampwidth() != 2:
            print("Audio format not mono 16-bit PCM")
            return "Audio format non reconnu. Veuillez utiliser un fichier mono 16-bit PCM."
        # Initialize the recognizer
        recognizer = KaldiRecognizer(model, wf.getframerate())
        recognizer.SetWords(True)
        # Process the entire audio file at once
        full_text = ""
        recognition_attempted = False
        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break
            recognition_attempted = True
            if recognizer.AcceptWaveform(data):
                result = json.loads(recognizer.Result())
                full_text += result.get("text", "") + " "
        # Get the final result
        result = json.loads(recognizer.FinalResult())
        full_text += result.get("text", "")
        print("Recognition attempted:", recognition_attempted)
        print("Vosk final text:", repr(full_text.strip()))
        return full_text.strip() if full_text else "Je n'ai pas pu comprendre votre message. Veuillez essayer à nouveau."
    except Exception as e:
        print(f"❌ Error in transcription: {str(e)}")
        return "Une erreur s'est produite lors de la transcription. Veuillez réessayer."
    finally:
        # Clean up temporary file
        if temp_wav and os.path.exists(temp_wav.name):
            try:
                os.remove(temp_wav.name)
            except:
                pass 