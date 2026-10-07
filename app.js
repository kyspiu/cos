const STORAGE_KEY = "mowik-sentences";
const REACTION_STORAGE_KEY = "mowik-reactions";
const REACTION_ID_PREFIX = "__mowik_reaction__";
const QUICK_RESPONSE_IDS = {
  yes: "__mowik_quick_response_yes__",
  no: "__mowik_quick_response_no__"
};

const SUPABASE_URL = "https://jewnkofqgzorwtypcrji.supabase.co";
const SUPABASE_KEY = "sb_publishable_X6kl-KaeI591E6xW7KFl6g_VYTPCC1G";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

let activeRecording = null;
let activeSentenceId = null;
let editingItemId = null;
let openSpecialSentenceId = null;
let supportsSpecialWords = null;

const state = {
  sentenceList: loadSentenceList(),
  reactionList: loadReactionList(),
  quickResponses: {
    yes: { id: QUICK_RESPONSE_IDS.yes, text: "TAK", audioUrl: "" },
    no: { id: QUICK_RESPONSE_IDS.no, text: "NIE", audioUrl: "" }
  }
};

const sentenceList = document.getElementById("sentenceList");
const sentenceInput = document.getElementById("sentenceInput");
const specialSentenceInput = document.getElementById("specialSentenceInput");
const btnAddSentence = document.getElementById("btnAddSentence");
const sentenceCount = document.getElementById("sentenceCount");
const appStatus = document.getElementById("appStatus");
const quickResponses = document.querySelector(".quick-responses");
const reactionList = document.getElementById("reactionList");
const reactionInput = document.getElementById("reactionInput");
const btnAddReaction = document.getElementById("btnAddReaction");

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadItemList(storageKey, itemType) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (Array.isArray(saved)) {
      return saved.map((item) => ({
        id: typeof item.id === "string" ? item.id : createId(),
        text: String(item.text || "").trim(),
        audioUrl: typeof item.audioUrl === "string" ? item.audioUrl : "",
        special: item.special === true,
        specialWords: Array.isArray(item.specialWords)
          ? item.specialWords.map((word) => ({
            id: typeof word.id === "string" ? word.id : createId(),
            text: String(word.text || "").trim(),
            audioUrl: typeof word.audioUrl === "string" ? word.audioUrl : ""
          })).filter((word) => word.text)
          : []
      })).filter((item) => item.text);
    }
  } catch (error) {
    console.warn(`Nie udało się odczytać zapisanych elementów (${itemType}).`, error);
  }

  return [];
}

function loadSentenceList() {
  return loadItemList(STORAGE_KEY, "zdania");
}

function loadReactionList() {
  return loadItemList(REACTION_STORAGE_KEY, "reakcje");
}

function saveSentenceList() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sentenceList));
  } catch (error) {
    console.error("Nie udało się zapisać zdań lokalnie:", error);
    showStatus("Nie udało się zapisać zmian na tym urządzeniu.");
  }
}

function saveReactionList() {
  try {
    localStorage.setItem(REACTION_STORAGE_KEY, JSON.stringify(state.reactionList));
  } catch (error) {
    console.error("Nie udało się zapisać reakcji lokalnie:", error);
    showStatus("Nie udało się zapisać zmian na tym urządzeniu.");
  }
}

function saveItemLocally(item) {
  const sentenceOwner = state.sentenceList.find((sentence) =>
    sentence.id === item.id || sentence.specialWords.some((word) => word.id === item.id));
  if (sentenceOwner) {
    saveSentenceList();
    return;
  }
  if (item.id.startsWith(REACTION_ID_PREFIX)) {
    saveReactionList();
  }
}

function getPersistedItem(item) {
  return state.sentenceList.find((sentence) =>
    sentence.id === item.id || sentence.specialWords.some((word) => word.id === item.id))
    || state.reactionList.find((reaction) => reaction.id === item.id)
    || Object.values(state.quickResponses).find((response) => response.id === item.id)
    || item;
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

async function loadItemsFromSupabase() {
  if (!supabaseClient) return;

  let result = await supabaseClient
    .from("sentence_items")
    .select("id, text, audio_url, special_words")
    .order("created_at", { ascending: true });

  if (result.error && isMissingSpecialWordsColumn(result.error)) {
    supportsSpecialWords = false;
    console.warn("Kolumna special_words nie istnieje jeszcze w Supabase. Uruchom aktualny supabase.sql, aby synchronizować zdania specjalne.");
    result = await supabaseClient
      .from("sentence_items")
      .select("id, text, audio_url")
      .order("created_at", { ascending: true });
  } else if (!result.error) {
    supportsSpecialWords = true;
  }

  if (result.error || !result.data) {
    if (result.error) {
      console.error("Nie udało się pobrać elementów z Supabase:", result.error);
    }
    return;
  }

  const remoteSentences = [];
  const remoteReactions = [];
  result.data.forEach((item) => {
    const id = String(item.id);
    const quickResponse = Object.values(state.quickResponses).find((response) => response.id === id);
    if (quickResponse) {
      quickResponse.audioUrl = item.audio_url || "";
    } else if (id.startsWith(REACTION_ID_PREFIX)) {
      remoteReactions.push({
        id,
        text: item.text,
        audioUrl: item.audio_url || ""
      });
    } else {
      remoteSentences.push({
        id,
        text: item.text,
        audioUrl: item.audio_url || "",
        special: Array.isArray(item.special_words),
        specialWords: Array.isArray(item.special_words) ? item.special_words : []
      });
    }
  });

  if (!supportsSpecialWords) {
    const localSpecialSentences = state.sentenceList.filter((item) => item.special);
    const remoteIds = new Set(remoteSentences.map((item) => item.id));
    remoteSentences.forEach((item) => {
      const localSpecial = localSpecialSentences.find((localItem) => localItem.id === item.id);
      if (localSpecial) {
        item.special = true;
        item.specialWords = localSpecial.specialWords;
      }
    });
    remoteSentences.push(...localSpecialSentences.filter((item) => !remoteIds.has(item.id)));
  }
  if (remoteSentences.length > 0) {
    state.sentenceList = remoteSentences;
  }
  if (remoteReactions.length > 0) {
    state.reactionList = remoteReactions;
  }
  saveSentenceList();
  saveReactionList();
  renderSentenceList();
  renderReactionList();
  renderQuickResponses();
}

async function upsertItemInSupabase(item) {
  if (!supabaseClient) return false;

  const payload = {
    id: item.id,
    text: item.text,
    audio_url: item.audioUrl || null,
    special_words: Array.isArray(item.specialWords) ? item.specialWords : []
  };

  const { error } = await supabaseClient
    .from("sentence_items")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    if (isMissingSpecialWordsColumn(error)) {
      supportsSpecialWords = false;
      const { error: fallbackError } = await supabaseClient
        .from("sentence_items")
        .upsert({
          id: item.id,
          text: item.text,
          audio_url: item.audioUrl || null
        }, { onConflict: "id" });
      if (fallbackError) {
        console.error("Błąd zapisu elementu do Supabase:", fallbackError);
        return false;
      }
      if (item.special || item.specialWords && item.specialWords.length > 0) {
        console.warn("Dodatkowe słowa zapisano lokalnie. Uruchom aktualny supabase.sql, aby zsynchronizować je z Supabase.");
        return false;
      }
      return true;
    }
    console.error("Błąd zapisu elementu do Supabase:", error);
    return false;
  }

  if (supportsSpecialWords === false && (item.special || item.specialWords && item.specialWords.length > 0)) {
    console.warn("Dodatkowe słowa zapisano lokalnie. Uruchom aktualny supabase.sql, aby zsynchronizować je z Supabase.");
    return false;
  }

  supportsSpecialWords = true;
  return true;
}

function isMissingSpecialWordsColumn(error) {
  return (error.code === "42703" || error.code === "PGRST204")
    && /special_words/i.test(error.message || "");
}

async function deleteItemFromSupabase(id) {
  if (!supabaseClient) return;

  const { error } = await supabaseClient
    .from("sentence_items")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Błąd usuwania elementu z Supabase:", error);
  }
}

function playSentenceAudio(sentence) {
  if (!sentence.audioUrl) {
    const persistedItem = getPersistedItem(sentence);
    const message = sentence.id.startsWith(REACTION_ID_PREFIX)
      ? "Ta reakcja nie ma jeszcze nagrania."
      : persistedItem.id !== sentence.id
        ? "To słowo nie ma jeszcze nagrania."
        : "To zdanie nie ma jeszcze nagrania.";
    showStatus(message);
    return;
  }

  const audio = new Audio(sentence.audioUrl);
  audio.play().then(() => {
    showStatus(`Odtwarzam: ${sentence.text}`);
  }).catch((error) => {
    console.warn("Nie udało się odtworzyć audio:", sentence.text, error);
    showStatus("Nie udało się odtworzyć nagrania.");
  });
}

async function playSpecialWord(sentence, word) {
  if (!sentence.audioUrl) {
    showStatus("To zdanie nie ma jeszcze nagrania.");
    return;
  }
  if (!word.audioUrl) {
    showStatus("To słowo nie ma jeszcze nagrania.");
    return;
  }

  try {
    showStatus(`Odtwarzam: ${sentence.text}, potem ${word.text}`);
    await playAudioClip(sentence.audioUrl);
    await playAudioClip(word.audioUrl);
  } catch (error) {
    console.warn("Nie udało się odtworzyć zdania specjalnego:", sentence.text, word.text, error);
    showStatus("Nie udało się odtworzyć zdania i dodatkowego słowa.");
  }
}

function playAudioClip(audioUrl) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(audioUrl);
    audio.addEventListener("ended", resolve, { once: true });
    audio.addEventListener("error", () => reject(new Error("Nagranie audio nie jest dostępne.")), { once: true });
    audio.play().catch(reject);
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

function renderReactionList() {
  reactionList.innerHTML = "";

  if (state.reactionList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "reaction-empty";
    empty.setAttribute("role", "listitem");
    empty.textContent = "Brak reakcji";
    reactionList.appendChild(empty);
    return;
  }

  state.reactionList.forEach((reaction) => {
    const card = document.createElement("article");
    card.className = "reaction-card";
    card.setAttribute("role", "listitem");
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input")) {
        return;
      }
      playSentenceAudio(reaction);
    });

    const isEditing = editingItemId === reaction.id;
    const isRecording = activeSentenceId === reaction.id;
    let reactionInputElement;
    if (isEditing) {
      reactionInputElement = document.createElement("input");
      reactionInputElement.className = "reaction-edit-input";
      reactionInputElement.type = "text";
      reactionInputElement.maxLength = 80;
      reactionInputElement.value = reaction.text;
      reactionInputElement.setAttribute("aria-label", `Edytuj reakcję: ${reaction.text}`);
      reactionInputElement.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveItemEdit(reaction, reactionInputElement);
        } else if (event.key === "Escape") {
          editingItemId = null;
          renderReactionList();
        }
      });
      queueMicrotask(() => reactionInputElement.focus());
      card.appendChild(reactionInputElement);
    } else {
      const playButton = document.createElement("button");
      playButton.type = "button";
      playButton.className = "reaction-play";
      playButton.textContent = reaction.text;
      playButton.title = reaction.audioUrl ? "Odtwórz reakcję" : "Najpierw nagraj reakcję";
      playButton.setAttribute("aria-label", `Odtwórz reakcję: ${reaction.text}`);
      playButton.addEventListener("click", () => playSentenceAudio(reaction));
      card.appendChild(playButton);
    }

    if (reaction.audioUrl && !isRecording && !isEditing) {
      const recordedBadge = document.createElement("span");
      recordedBadge.className = "reaction-recorded";
      recordedBadge.textContent = "✓ Nagrane";
      card.appendChild(recordedBadge);
    }

    const actions = document.createElement("div");
    actions.className = "reaction-actions";

    if (isEditing) {
      const saveButton = createReactionAction("✓", "Zapisz reakcję", "edit");
      saveButton.addEventListener("click", () => saveItemEdit(reaction, reactionInputElement));
      const cancelButton = createReactionAction("×", "Anuluj edycję", "");
      cancelButton.addEventListener("click", () => {
        editingItemId = null;
        renderReactionList();
      });
      actions.append(saveButton, cancelButton);
    } else {
      const editButton = createReactionAction("✎", `Edytuj reakcję: ${reaction.text}`, "edit");
      editButton.addEventListener("click", () => {
        editingItemId = reaction.id;
        renderReactionList();
      });

      const recordButton = createReactionAction(isRecording ? "■" : "●", `${isRecording ? "Zatrzymaj nagrywanie" : "Nagraj"} reakcję: ${reaction.text}`, "record");
      recordButton.addEventListener("click", async () => toggleRecording(reaction));

      const deleteButton = createReactionAction("×", `Usuń reakcję: ${reaction.text}`, "delete");
      deleteButton.addEventListener("click", async () => {
        state.reactionList = state.reactionList.filter((item) => item.id !== reaction.id);
        saveReactionList();
        await deleteItemFromSupabase(reaction.id);
        renderReactionList();
      });
      actions.append(editButton, recordButton, deleteButton);
    }

    card.appendChild(actions);
    reactionList.appendChild(card);
  });
}

function createReactionAction(symbol, label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `reaction-action ${action}`;
  button.textContent = symbol;
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
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
    const entry = document.createElement("div");
    entry.className = "sentence-entry";
    const row = document.createElement("div");
    row.className = "sentence-row";
    row.title = sentence.audioUrl ? "Kliknij, aby odsłuchać nagranie" : "Kliknij, aby odtworzyć nagranie po dodaniu";

    const content = document.createElement("div");
    content.className = "sentence-content";

    if (editingItemId === sentence.id) {
      const editInput = document.createElement("input");
      editInput.className = "sentence-edit-input";
      editInput.type = "text";
      editInput.maxLength = 80;
      editInput.value = sentence.text;
      editInput.setAttribute("aria-label", `Edytuj zdanie: ${sentence.text}`);
      editInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveItemEdit(sentence, editInput);
        } else if (event.key === "Escape") {
          editingItemId = null;
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

      if (sentence.special) {
        const optionsButton = document.createElement("button");
        optionsButton.type = "button";
        optionsButton.className = "sentence-options-toggle";
        optionsButton.textContent = openSpecialSentenceId === sentence.id ? "−" : "+";
        optionsButton.title = openSpecialSentenceId === sentence.id
          ? "Zamknij dodatkowe słowa"
          : "Dodaj lub edytuj dodatkowe słowa";
        optionsButton.setAttribute("aria-label", optionsButton.title);
        optionsButton.setAttribute("aria-expanded", String(openSpecialSentenceId === sentence.id));
        optionsButton.addEventListener("click", () => {
          openSpecialSentenceId = openSpecialSentenceId === sentence.id ? null : sentence.id;
          renderSentenceList();
        });
        content.appendChild(optionsButton);
      }

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
      await deleteItemFromSupabase(sentence.id);
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
    editButton.textContent = editingItemId === sentence.id ? "Zapisz" : "Edytuj";
    editButton.setAttribute("aria-label", `${editingItemId === sentence.id ? "Zapisz" : "Edytuj"} zdanie ${sentence.text}`);
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (editingItemId === sentence.id) {
        saveItemEdit(sentence, content.querySelector(".sentence-edit-input"));
      } else {
        editingItemId = sentence.id;
        renderSentenceList();
      }
    });

    if (editingItemId === sentence.id) {
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "sentence-action";
      cancelButton.textContent = "Anuluj";
      cancelButton.addEventListener("click", () => {
        editingItemId = null;
        renderSentenceList();
      });
      actions.append(editButton, cancelButton);
    } else {
      actions.append(deleteButton, editButton, recordButton);
    }
    row.append(content, actions);
    entry.appendChild(row);

    if (sentence.special && openSpecialSentenceId === sentence.id) {
      entry.appendChild(renderSpecialWords(sentence));
    }
    sentenceList.appendChild(entry);
  });
}

function renderSpecialWords(sentence) {
  const panel = document.createElement("section");
  panel.className = "special-words-panel";
  panel.setAttribute("aria-label", `Dodatkowe słowa do zdania: ${sentence.text}`);

  const heading = document.createElement("h3");
  heading.textContent = "Wybierz dodatkowe słowo";
  panel.appendChild(heading);

  const form = document.createElement("form");
  form.className = "special-word-composer";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 80;
  input.placeholder = "dodaj słowo, np. Agnieszki";
  input.setAttribute("aria-label", "Dodaj dodatkowe słowo");
  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.className = "composer-button add-button";
  addButton.textContent = "+ Dodaj słowo";
  form.append(input, addButton);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    sentence.specialWords.push({ id: createId(), text: value, audioUrl: "" });
    saveSentenceList();
    renderSentenceList();
    await syncSpecialSentence(sentence, "Słowo");
  });
  panel.appendChild(form);

  const words = document.createElement("div");
  words.className = "special-word-list";
  if (sentence.specialWords.length === 0) {
    const empty = document.createElement("p");
    empty.className = "special-word-empty";
    empty.textContent = "Dodaj słowa, które można wstawić do tego zdania.";
    words.appendChild(empty);
  } else {
    sentence.specialWords.forEach((word) => {
      words.appendChild(renderSpecialWord(sentence, word));
    });
  }
  panel.appendChild(words);
  return panel;
}

function renderSpecialWord(sentence, word) {
  const card = document.createElement("div");
  card.className = "special-word-card";
  const isEditing = editingItemId === word.id;
  const isRecording = activeSentenceId === word.id;

  if (isEditing) {
    const input = document.createElement("input");
    input.className = "special-word-edit-input";
    input.type = "text";
    input.maxLength = 80;
    input.value = word.text;
    input.setAttribute("aria-label", `Edytuj dodatkowe słowo: ${word.text}`);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveItemEdit(word, input);
      } else if (event.key === "Escape") {
        editingItemId = null;
        renderSentenceList();
      }
    });
    queueMicrotask(() => input.focus());
    card.appendChild(input);
  } else {
    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "special-word-play";
    playButton.textContent = word.text;
    playButton.setAttribute("aria-label", `Odtwórz dodatkowe słowo: ${word.text}`);
    playButton.addEventListener("click", () => playSpecialWord(sentence, word));
    card.appendChild(playButton);
  }

  const actions = document.createElement("div");
  actions.className = "special-word-actions";
  if (isEditing) {
    const saveButton = createSpecialWordAction("Zapisz", "Zapisz słowo", "edit");
    saveButton.addEventListener("click", () => saveItemEdit(word, card.querySelector("input")));
    const cancelButton = createSpecialWordAction("Anuluj", "Anuluj edycję słowa", "");
    cancelButton.addEventListener("click", () => {
      editingItemId = null;
      renderSentenceList();
    });
    actions.append(saveButton, cancelButton);
  } else {
    const editButton = createSpecialWordAction("Edytuj", `Edytuj słowo ${word.text}`, "edit");
    editButton.addEventListener("click", () => {
      editingItemId = word.id;
      renderSentenceList();
    });
    const recordButton = createSpecialWordAction(
      isRecording ? "Zatrzymaj" : "Nagraj",
      `${isRecording ? "Zatrzymaj nagrywanie" : "Nagraj"} słowo ${word.text}`,
      "record"
    );
    recordButton.addEventListener("click", async () => toggleRecording(word));
    const deleteButton = createSpecialWordAction("Usuń", `Usuń słowo ${word.text}`, "delete");
    deleteButton.addEventListener("click", async () => {
      sentence.specialWords = sentence.specialWords.filter((item) => item.id !== word.id);
      saveSentenceList();
      renderSentenceList();
      await deleteSpecialWordRecording(word.id);
      await syncSpecialSentence(sentence, "Słowo");
    });
    actions.append(editButton, recordButton, deleteButton);
  }
  card.appendChild(actions);

  if (word.audioUrl && !isRecording && !isEditing) {
    const badge = document.createElement("span");
    badge.className = "special-word-recorded";
    badge.textContent = "✓ Nagrane";
    card.appendChild(badge);
  }
  return card;
}

function createSpecialWordAction(text, label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `special-word-action ${action}`;
  button.textContent = text;
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}

async function deleteSpecialWordRecording(wordId) {
  if (!supabaseClient) {
    return;
  }
  const { error } = await supabaseClient.storage
    .from("sentence-audio")
    .remove([`${wordId}.webm`]);
  if (error) {
    console.error("Nie udało się usunąć nagrania dodatkowego słowa:", error);
  }
}

async function syncSpecialSentence(sentence, itemName) {
  const synced = await upsertItemInSupabase(sentence);
  showStatus(synced
    ? `${itemName} zapisane.`
    : `${itemName} zapisane na tym urządzeniu, ale nie udało się zsynchronizować go z serwerem.`);
}

async function saveItemEdit(sentence, input) {
  if (!input) {
    return;
  }

  const newText = input.value.trim();
  if (!newText) {
    const itemType = sentence.id.startsWith(REACTION_ID_PREFIX)
      ? "reakcji"
      : getPersistedItem(sentence).id !== sentence.id ? "słowa" : "zdania";
    showStatus(`Treść ${itemType} nie może być pusta.`);
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

  editingItemId = null;
  const persistedItem = getPersistedItem(sentence);
  saveItemLocally(persistedItem);
  renderSentenceList();
  renderReactionList();
  const synced = await upsertItemInSupabase(persistedItem);
  const itemName = sentence.id.startsWith(REACTION_ID_PREFIX)
    ? "Reakcja"
    : persistedItem.id !== sentence.id ? "Słowo" : "Zdanie";
  showStatus(synced ? `${itemName} zapisane.` : `${itemName} zapisane na tym urządzeniu, ale nie udało się zsynchronizować go z serwerem.`);
}

function stopActiveRecording() {
  if (activeRecording && activeRecording.state !== "inactive") {
    activeRecording.stop();
  }
}

function getRecordingItem(id) {
  return state.sentenceList.find((item) => item.id === id)
    || state.sentenceList.flatMap((item) => item.specialWords).find((word) => word.id === id)
    || state.reactionList.find((item) => item.id === id)
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
    renderReactionList();
    renderQuickResponses();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const item = getRecordingItem(sentence.id);
      const persistedItem = item && getPersistedItem(item);

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

        saveItemLocally(item);
        const synced = await upsertItemInSupabase(persistedItem);
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
        renderReactionList();
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
    audioUrl: "",
    special: specialSentenceInput.checked,
    specialWords: []
  };

  state.sentenceList.push(item);
  saveSentenceList();
  sentenceInput.value = "";
  specialSentenceInput.checked = false;
  renderSentenceList();
  upsertItemInSupabase(item).then((synced) => {
    if (item.special && !synced) {
      showStatus("Zdanie specjalne zapisane na tym urządzeniu, ale nie udało się zsynchronizować go z serwerem.");
    }
  });
  sentenceInput.focus();
}

function addReaction() {
  const value = reactionInput.value.trim();
  if (!value) {
    reactionInput.focus();
    return;
  }

  const item = {
    id: `${REACTION_ID_PREFIX}${createId()}`,
    text: value,
    audioUrl: ""
  };

  state.reactionList.push(item);
  saveReactionList();
  reactionInput.value = "";
  renderReactionList();
  upsertItemInSupabase(item);
  reactionInput.focus();
}

function handleSentenceInputKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    addSentence();
  }
}

function handleReactionInputKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    addReaction();
  }
}

btnAddSentence.addEventListener("click", addSentence);
sentenceInput.addEventListener("keydown", handleSentenceInputKeydown);
btnAddReaction.addEventListener("click", addReaction);
reactionInput.addEventListener("keydown", handleReactionInputKeydown);

renderSentenceList();
renderReactionList();
renderQuickResponses();
loadItemsFromSupabase();
