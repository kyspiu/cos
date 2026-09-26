const STORAGE_KEY = "mowik-sentences";
const QUICK_RESPONSE_IDS = {
  yes: "__mowik_quick_response_yes__",
  no: "__mowik_quick_response_no__"
};

const SUPABASE_URL = "https://jewnkofqgzorwtypcrji.supabase.co";
const SUPABASE_KEY = "sb_publishable_X6kl-KaeI591E6xW7KFl6g_VYTPCC1G";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let activeRecording = null;
let activeSentenceId = null;
let editingSentenceId = null;

const state = {
  sentenceList: loadSentenceList(),
  quickResponses: {
    yes: { id: QUICK_RESPONSE_IDS.yes, text: "TAK", audioUrl: "" },
    no: { id: QUICK_RESPONSE_IDS.no, text: "NIE", audioUrl: "" }
  }
};

const sentenceList = document.getElementById("sentenceList");
const sentenceInput = document.getElementById("sentenceInput");
const btnAddSentence = document.getElementById("btnAddSentence");
const sentenceCount = document.getElementById("sentenceCount");
const appStatus = document.getElementById("appStatus");
const quickResponses = document.querySelector(".quick-responses");

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

  if (error || !data) {
    if (error) {
      console.error("Nie udało się pobrać zdań z Supabase:", error);
    }
    return;
  }

  const remoteSentences = [];
  data.forEach((item) => {
    const id = String(item.id);
    const quickResponse = Object.values(state.quickResponses).find((response) => response.id === id);
    if (quickResponse) {
      quickResponse.audioUrl = item.audio_url || "";
    } else {
      remoteSentences.push({
        id,
        text: item.text,
        audioUrl: item.audio_url || ""
      });
    }
  });

  if (remoteSentences.length > 0) {
    state.sentenceList = remoteSentences;
  }
  saveSentenceList();
  renderSentenceList();
  renderQuickResponses();
}

async function upsertSentenceInSupabase(item) {
  if (!supabaseClient) return false;

  const { error } = await supabaseClient
    .from("sentence_items")
    .upsert({
      id: item.id,
      text: item.text,
      audio_url: item.audioUrl || null
    }, { onConflict: "id" });

  if (error) {
    console.error("Błąd zapisu zdania do Supabase:", error);
    return false;
  }

  return true;
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

function renderQuickResponses() {
  quickResponses.querySelectorAll(".quick-response").forEach((container) => {
    const response = state.quickResponses[container.dataset.response];
    if (!response) {
      return;
    }

    const playButton = container.querySelector(".quick-response-play");
    const recordButton = container.querySelector(".quick-response-record");
    const status = container.querySelector(".quick-response-status");
    const isRecording = activeSentenceId === response.id;

    playButton.setAttribute("aria-label", `Odtwórz ${response.text}`);
    playButton.title = response.audioUrl ? `Odtwórz ${response.text}` : "Najpierw nagraj odpowiedź";
    recordButton.textContent = isRecording ? "Zatrzymaj" : "Nagraj";
    recordButton.setAttribute("aria-label", `${isRecording ? "Zatrzymaj nagrywanie" : "Nagraj"} ${response.text}`);
    status.textContent = response.audioUrl && !isRecording ? "✓ Nagrane" : "";
  });
}

quickResponses.addEventListener("click", async (event) => {
  const container = event.target.closest(".quick-response");
  if (!container) {
    return;
  }
  const response = state.quickResponses[container.dataset.response];
  if (!response) {
    return;
  }

  if (event.target.closest(".quick-response-play")) {
    playSentenceAudio(response);
  } else if (event.target.closest(".quick-response-record")) {
    await toggleRecording(response);
  }
});

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

    const content = document.createElement("div");
    content.className = "sentence-content";

    if (editingSentenceId === sentence.id) {
      const editInput = document.createElement("input");
      editInput.className = "sentence-edit-input";
      editInput.type = "text";
      editInput.maxLength = 80;
      editInput.value = sentence.text;
      editInput.setAttribute("aria-label", `Edytuj zdanie: ${sentence.text}`);
      editInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveSentenceEdit(sentence, editInput);
        } else if (event.key === "Escape") {
          editingSentenceId = null;
          renderSentenceList();
        }
      });
      content.appendChild(editInput);
      queueMicrotask(() => editInput.focus());
    } else {
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
      content.appendChild(text);

      if (sentence.audioUrl && activeSentenceId !== sentence.id) {
        const recordedBadge = document.createElement("span");
        recordedBadge.className = "sentence-recorded";
        recordedBadge.textContent = "✓ Nagrane";
        recordedBadge.setAttribute("aria-label", "Zdanie ma nagranie");
        content.appendChild(recordedBadge);
      }
    }

    row.addEventListener("click", (event) => {
      if (event.target.closest("button, input")) {
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
    recordButton.textContent = activeSentenceId === sentence.id
      ? "Zatrzymaj"
      : "Nagraj";
    recordButton.setAttribute("aria-label", `Nagraj: ${sentence.text}`);
    recordButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await toggleRecording(sentence);
    });

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "sentence-action edit";
    editButton.textContent = editingSentenceId === sentence.id ? "Zapisz" : "Edytuj";
    editButton.setAttribute("aria-label", `${editingSentenceId === sentence.id ? "Zapisz" : "Edytuj"} zdanie ${sentence.text}`);
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (editingSentenceId === sentence.id) {
        saveSentenceEdit(sentence, content.querySelector(".sentence-edit-input"));
      } else {
        editingSentenceId = sentence.id;
        renderSentenceList();
      }
    });

    if (editingSentenceId === sentence.id) {
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "sentence-action";
      cancelButton.textContent = "Anuluj";
      cancelButton.addEventListener("click", () => {
        editingSentenceId = null;
        renderSentenceList();
      });
      actions.append(editButton, cancelButton);
    } else {
      actions.append(deleteButton, editButton, recordButton);
    }
    row.append(content, actions);
    sentenceList.appendChild(row);
  });
}

async function saveSentenceEdit(sentence, input) {
  if (!input) {
    return;
  }

  const newText = input.value.trim();
  if (!newText) {
    showStatus("Treść zdania nie może być pusta.");
    input.focus();
    return;
  }

  const textChanged = newText !== sentence.text;
  sentence.text = newText;
  if (textChanged && sentence.audioUrl) {
    sentence.audioUrl = "";
    if (supabaseClient) {
      const { error } = await supabaseClient.storage
        .from("sentence-audio")
        .remove([`${sentence.id}.webm`]);
      if (error) {
        console.error("Nie udało się usunąć starego nagrania:", error);
      }
    }
  }

  editingSentenceId = null;
  saveSentenceList();
  renderSentenceList();
  const synced = await upsertSentenceInSupabase(sentence);
  showStatus(synced ? "Zdanie zapisane." : "Zdanie zapisane na tym urządzeniu, ale nie udało się zsynchronizować go z serwerem.");
}

function stopActiveRecording() {
  if (activeRecording && activeRecording.state !== "inactive") {
    activeRecording.stop();
  }
}

function getRecordingItem(id) {
  return state.sentenceList.find((item) => item.id === id)
    || Object.values(state.quickResponses).find((item) => item.id === id);
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
    renderQuickResponses();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const item = getRecordingItem(sentence.id);

      try {
        if (!item) {
          return;
        }
        if (blob.size === 0) {
          showStatus("Nagranie jest puste. Poprzednie nagranie pozostało bez zmian.");
          return;
        }
        if (!supabaseClient) {
          showStatus("Nie można zapisać nagrania bez połączenia z serwerem.");
          return;
        }

        const replacingRecording = Boolean(item.audioUrl);
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
        const audioUrl = new URL(publicUrlData.publicUrl);
        audioUrl.searchParams.set("v", String(Date.now()));
        item.audioUrl = audioUrl.toString();

        saveSentenceList();
        const synced = await upsertSentenceInSupabase(item);
        if (synced) {
          showStatus(replacingRecording ? "Nagranie zastąpione nowym." : "Nagranie zapisane.");
        } else {
          showStatus("Nagranie zapisane, ale nie udało się zsynchronizować go z serwerem.");
        }
      } catch (uploadError) {
        console.error("Upload audio to Supabase failed:", uploadError);
        showStatus("Nie udało się zapisać nowego nagrania. Poprzednie nagranie pozostało bez zmian.");
      } finally {
        stream.getTracks().forEach((track) => track.stop());
        activeRecording = null;
        activeSentenceId = null;
        renderSentenceList();
        renderQuickResponses();
      }
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
renderQuickResponses();
loadSentencesFromSupabase();
