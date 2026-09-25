const STORAGE_KEY = "mowik-sentences";

const SUPABASE_URL = "https://jewnkofqgzorwtypcrji.supabase.co";
const SUPABASE_KEY = "sb_publishable_X6kl-KaeI591E6xW7KFl6g_VYTPCC1G";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let activeRecording = null;
let activeSentenceId = null;

const state = {
  sentenceList: loadSentenceList()
};

const sentenceList = document.getElementById("sentenceList");
const sentenceInput = document.getElementById("sentenceInput");
const btnAddSentence = document.getElementById("btnAddSentence");
const sentenceCount = document.getElementById("sentenceCount");
const appStatus = document.getElementById("appStatus");

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadSentenceList() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length > 0) {
      return saved.map((item) => ({
        id: typeof item.id === "string" ? item.id : createId(),
        text: String(item.text || "").trim(),
        audioUrl: typeof item.audioUrl === "string" ? item.audioUrl : ""
      })).filter((item) => item.text);
    }
  } catch (error) {
    console.warn("Nie udało się odczytać zapisanych zdań.", error);
  }

  return [];
}

function saveSentenceList() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sentenceList));
  } catch (error) {
    console.error("Nie udało się zapisać zdań lokalnie:", error);
    showStatus("Nie udało się zapisać zmian na tym urządzeniu.");
  }
}

function showStatus(message) {
  appStatus.textContent = message;
}

function getSentenceCountLabel(count) {
  if (count === 1) {
    return "zdanie";
  }
  if (count >= 2 && count <= 4) {
    return "zdania";
  }
  return "zdań";
}

async function loadSentencesFromSupabase() {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from("sentence_items")
    .select("id, text, audio_url")
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) {
    return;
  }

  state.sentenceList = data.map((item) => ({
    id: String(item.id),
    text: item.text,
    audioUrl: item.audio_url || ""
  }));

  saveSentenceList();
  renderSentenceList();
}

async function upsertSentenceInSupabase(item) {
  if (!supabaseClient) return;

  const { error } = await supabaseClient
    .from("sentence_items")
    .upsert({
      id: item.id,
      text: item.text,
      audio_url: item.audioUrl || null
    }, { onConflict: "id" });

  if (error) {
    console.error("Błąd zapisu zdania do Supabase:", error);
  }
}

async function deleteSentenceFromSupabase(id) {
  if (!supabaseClient) return;

  const { error } = await supabaseClient
    .from("sentence_items")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Błąd usuwania zdania z Supabase:", error);
  }
}

function playSentenceAudio(sentence) {
  if (!sentence.audioUrl) {
    showStatus("To zdanie nie ma jeszcze nagrania.");
    return;
  }

  const audio = new Audio(sentence.audioUrl);
  audio.play().then(() => {
    showStatus(`Odtwarzam: ${sentence.text}`);
  }).catch((error) => {
    console.warn("Nie udało się odtworzyć audio dla zdania:", sentence.text, error);
    showStatus("Nie udało się odtworzyć nagrania.");
  });
}

function renderSentenceList() {
  sentenceList.innerHTML = "";
  sentenceCount.textContent = `${state.sentenceList.length} ${getSentenceCountLabel(state.sentenceList.length)}`;

  if (state.sentenceList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sentence-empty";
    empty.textContent = "Brak zdań";
    sentenceList.appendChild(empty);
    return;
  }

  state.sentenceList.forEach((sentence) => {
    const row = document.createElement("div");
    row.className = "sentence-row";
    row.title = sentence.audioUrl ? "Kliknij, aby odsłuchać nagranie" : "Kliknij, aby odtworzyć nagranie po dodaniu";

    const text = document.createElement("span");
    text.className = "sentence-text";
    text.tabIndex = 0;
    text.setAttribute("role", "button");
    text.setAttribute("aria-label", `Odtwórz zdanie: ${sentence.text}`);
    text.textContent = sentence.text;

    text.addEventListener("click", (event) => {
      event.stopPropagation();
      playSentenceAudio(sentence);
    });
    text.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        playSentenceAudio(sentence);
      }
    });

    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      playSentenceAudio(sentence);
    });
    const actions = document.createElement("div");
    actions.className = "sentence-actions";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "sentence-action delete";
    deleteButton.textContent = "Usuń";
    deleteButton.setAttribute("aria-label", `Usuń zdanie ${sentence.text}`);
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      state.sentenceList = state.sentenceList.filter((item) => item.id !== sentence.id);
      saveSentenceList();
      await deleteSentenceFromSupabase(sentence.id);
      renderSentenceList();
    });

    const recordButton = document.createElement("button");
    recordButton.type = "button";
    recordButton.className = "sentence-action record";
    recordButton.textContent = activeSentenceId === sentence.id ? "Zatrzymaj" : sentence.audioUrl ? "Odtwórz" : "Nagraj";
    recordButton.setAttribute("aria-label", `${sentence.audioUrl ? "Odtwórz nagranie" : "Nagraj"}: ${sentence.text}`);
    recordButton.addEventListener("click", async (event) => {
      event.stopPropagation();

      if (sentence.audioUrl && activeSentenceId !== sentence.id) {
        playSentenceAudio(sentence);
        return;
      }

      await toggleRecording(sentence);
    });

    actions.append(deleteButton, recordButton);
    row.append(text, actions);
    sentenceList.appendChild(row);
  });
}

function stopActiveRecording() {
  if (activeRecording && activeRecording.state !== "inactive") {
    activeRecording.stop();
  }
}

async function toggleRecording(sentence) {
  if (activeRecording && activeSentenceId === sentence.id) {
    activeRecording.stop();
    return;
  }

  if (activeRecording) {
    stopActiveRecording();
  }

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      throw new Error("Nagrywanie audio nie jest obsługiwane w tej przeglądarce.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    activeRecording = recorder;
    activeSentenceId = sentence.id;
    renderSentenceList();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const item = state.sentenceList.find((entry) => entry.id === sentence.id);

      if (item) {
        if (supabaseClient) {
          try {
            const fileName = `${item.id}.webm`;
            const { error: uploadError } = await supabaseClient.storage
              .from("sentence-audio")
              .upload(fileName, blob, { contentType: blob.type || "audio/webm", upsert: true });

            if (uploadError) {
              throw uploadError;
            }

            const { data: publicUrlData } = supabaseClient.storage
              .from("sentence-audio")
              .getPublicUrl(fileName);

            item.audioUrl = publicUrlData.publicUrl;
            showStatus("Nagranie zapisane.");
          } catch (uploadError) {
            console.error("Upload audio to Supabase failed:", uploadError);
            showStatus("Nagranie zapisane lokalnie, ale nie udało się wysłać go do Supabase.");
          }
        }

        saveSentenceList();
        await upsertSentenceInSupabase(item);
      }

      stream.getTracks().forEach((track) => track.stop());
      activeRecording = null;
      activeSentenceId = null;
      renderSentenceList();
    };

    recorder.start();
  } catch (error) {
    console.error("Nie udało się uruchomić mikrofonu:", error);
    showStatus(error.message || "Włącz dostęp do mikrofonu, aby nagrać własny głos.");
  }
}

function addSentence() {
  const value = sentenceInput.value.trim();
  if (!value) {
    sentenceInput.focus();
    return;
  }

  const item = {
    id: createId(),
    text: value,
    audioUrl: ""
  };

  state.sentenceList.push(item);
  saveSentenceList();
  sentenceInput.value = "";
  renderSentenceList();
  upsertSentenceInSupabase(item);
  sentenceInput.focus();
}

function handleSentenceInputKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    addSentence();
  }
}

btnAddSentence.addEventListener("click", addSentence);
sentenceInput.addEventListener("keydown", handleSentenceInputKeydown);

renderSentenceList();
loadSentencesFromSupabase();
