const SUPABASE_URL = "https://jewnkofqgzorwtypcrji.supabase.co";
const SUPABASE_KEY = "sb_publishable_X6kl-KaeI591E6xW7KFl6g_VYTPCC1G";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const rootCategory = {
    id: null,
    name: "Kategorie główne",
    type: "category",
    emoji: "🏠",
    color: "#4b5563"
};

const state = {
    categories: [],
    words: [],
    path: [rootCategory],
    sentence: []
};

const grid = document.getElementById("grid");
const speechDisplay = document.getElementById("speechDisplay");
const categoryPath = document.getElementById("categoryPath");
const categoryDialog = document.getElementById("categoryDialog");
const categoryForm = document.getElementById("categoryForm");
const categoryName = document.getElementById("categoryName");
const categoryEmoji = document.getElementById("categoryEmoji");
const categoryColor = document.getElementById("categoryColor");
const categorySpeak = document.getElementById("categorySpeak");
const categoryPalette = document.getElementById("categoryPalette");
const categoryMessage = document.getElementById("categoryMessage");
const editDialog = document.getElementById("editDialog");
const editForm = document.getElementById("editForm");
const editName = document.getElementById("editName");
const editEmoji = document.getElementById("editEmoji");
const editColor = document.getElementById("editColor");
const editPalette = document.getElementById("editPalette");
const editSpeak = document.getElementById("editSpeak");
const editSpeakRow = document.getElementById("editSpeakRow");
const editMessage = document.getElementById("editMessage");
let itemBeingEdited = null;
const wordDialog = document.getElementById("wordDialog");
const wordForm = document.getElementById("wordForm");
const wordName = document.getElementById("wordName");
const wordEmoji = document.getElementById("wordEmoji");
const wordColor = document.getElementById("wordColor");
const wordPalette = document.getElementById("wordPalette");
const wordMessage = document.getElementById("wordMessage");
let activeRecording = null;

const paletteColors = [
    "#d96c6c", "#e59a62", "#e5c466", "#b7c96f", "#86b88a",
    "#65b7a6", "#69b6c9", "#76a9d8", "#8797d5", "#a88fce",
    "#c58fc1", "#d88eaa", "#d99b9b", "#b79b87", "#9b9b8d",
    "#78909c", "#536d7a", "#8ca68f", "#a9a07e", "#c49a70"
];

function setupColorPalette(container, input) {
    paletteColors.forEach((color) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "color-swatch";
        button.style.backgroundColor = color;
        button.title = color;
        button.setAttribute("aria-label", `Kolor ${color}`);
        button.addEventListener("click", () => {
            input.value = color;
            container.querySelectorAll(".color-swatch").forEach((swatch) => swatch.classList.remove("selected"));
            button.classList.add("selected");
        });
        container.appendChild(button);
    });
}

function setPaletteValue(container, input, color) {
    input.value = color || paletteColors[4];
    container.querySelectorAll(".color-swatch").forEach((swatch) => {
        swatch.classList.toggle("selected", swatch.style.backgroundColor === input.value);
    });
}

function getCurrentCategory() {
    return state.path[state.path.length - 1];
}

async function loadData() {
    const [categoriesResult, wordsResult] = await Promise.all([
        supabaseClient.from("categories").select("id, name, emoji, color, audio_url, speak_enabled, parent_id, sort_order").order("sort_order"),
        supabaseClient.from("words").select("id, category_id, word, phrase, emoji, color, audio_url, sort_order").order("sort_order")
    ]);

    let categories = categoriesResult.data;
    let categoriesError = categoriesResult.error;
    if (categoriesError) {
        const fallbackCategories = await supabaseClient
            .from("categories")
            .select("id, name, emoji, color, parent_id, sort_order")
            .order("sort_order");
        categories = fallbackCategories.data;
        categoriesError = fallbackCategories.error;
    }

    let words = wordsResult.data;
    let wordsError = wordsResult.error;
    if (wordsError) {
        const fallbackWords = await supabaseClient
            .from("words")
            .select("id, category_id, word, phrase, emoji, color, sort_order")
            .order("sort_order");
        words = fallbackWords.data;
        wordsError = fallbackWords.error;
    }

    if (categoriesError || wordsError) {
        const error = categoriesError || wordsError;
        console.error("Nie udało się pobrać danych z Supabase:", error);
        grid.innerHTML = "<p class=\"empty-state\">Nie udało się pobrać danych z bazy.</p>";
        return;
    }

    state.categories = categories || [];
    state.words = words || [];
    render();
}

function getCurrentItems() {
    const categoryId = getCurrentCategory().id;
    const categories = state.categories
        .filter((category) => category.parent_id === categoryId)
        .map((category) => ({ ...category, type: "category" }));
    const words = state.words
        .filter((word) => word.category_id === categoryId)
        .map((word) => ({
            ...word,
            name: word.word || word.phrase,
            type: "word"
        }));
    return [...categories, ...words];
}

function render() {
    const items = getCurrentItems();
    grid.innerHTML = "";

    items.forEach((item) => {
        const cardShell = document.createElement("div");
        cardShell.className = "card-shell";

        const card = document.createElement("button");
        card.className = `card card-${item.type}`;
        const itemColor = item.color || "#86b88a";
        card.style.backgroundColor = item.type === "category" || item.type === "word" ? "#fffdf7" : itemColor;
        card.style.borderColor = itemColor;
        card.style.color = "#26352d";
        card.type = "button";

        const emoji = document.createElement("span");
        emoji.className = "card-emoji";
        emoji.textContent = item.emoji || (item.type === "category" ? "📁" : "💬");

        const label = document.createElement("span");
        label.className = "card-label";
        label.textContent = item.name;
        label.classList.toggle("single-word", !/\s/.test(item.name));

        const typeLabel = document.createElement("span");
        typeLabel.className = "card-type";
        typeLabel.textContent = item.type === "category" ? "KATEGORIA" : "SŁOWO";

        const speechMode = document.createElement("span");
        speechMode.className = "speech-mode";
        speechMode.textContent = item.type === "category" && item.speak_enabled === false ? "🔇" : "🎙";
        speechMode.title = item.type === "category" && item.speak_enabled === false
            ? "Pomijana przez POWIEDZ"
            : "Czytana przez POWIEDZ";

        card.append(emoji, label, typeLabel, speechMode);
        card.addEventListener("click", () => handleItemClick(item));
        cardShell.appendChild(card);

        cardShell.appendChild(createAudioControls(item));
        grid.appendChild(cardShell);
        fitCardLabel(label);
    });

    if (items.length === 0) {
        const emptyState = document.createElement("p");
        emptyState.className = "empty-state";
        emptyState.textContent = "Ta kategoria jest pusta. Użyj +, aby dodać podkategorię.";
        grid.appendChild(emptyState);
    }

    const addCategoryShell = document.createElement("div");
    addCategoryShell.className = "card-shell";
    const addCategoryButton = document.createElement("button");
    addCategoryButton.className = "card card-add-category";
    addCategoryButton.type = "button";
    addCategoryButton.innerHTML = "<span class=\"card-emoji\">+</span><span class=\"card-label\">NOWA KATEGORIA</span><span class=\"card-type\">DODAJ</span>";
    addCategoryButton.addEventListener("click", openCategoryDialog);
    addCategoryShell.appendChild(addCategoryButton);
    const emptyAudioControls = document.createElement("div");
    emptyAudioControls.className = "audio-controls audio-controls-placeholder";
    emptyAudioControls.setAttribute("aria-hidden", "true");
    addCategoryShell.appendChild(emptyAudioControls);
    grid.appendChild(addCategoryShell);

    const addWordShell = document.createElement("div");
    addWordShell.className = "card-shell";
    const addWordButton = document.createElement("button");
    addWordButton.className = "card card-add-word";
    addWordButton.type = "button";
    addWordButton.innerHTML = "<span class=\"card-emoji\">💬</span><span class=\"card-label\">NOWE SŁOWO</span><span class=\"card-type\">DODAJ</span>";
    addWordButton.addEventListener("click", openWordDialog);
    addWordShell.appendChild(addWordButton);
    const emptyWordControls = document.createElement("div");
    emptyWordControls.className = "audio-controls audio-controls-placeholder";
    emptyWordControls.setAttribute("aria-hidden", "true");
    addWordShell.appendChild(emptyWordControls);
    grid.appendChild(addWordShell);

    updatePathText();
    updateSpeechDisplay();
}

function updatePathText() {
    if (state.path.length === 1) {
        categoryPath.textContent = "Kategorie główne";
        return;
    }
    categoryPath.textContent = "Jesteś w: " + state.path.slice(1).map((category) => category.name).join(" → ");
}

function fitCardLabel(label) {
    if (!label.classList.contains("single-word")) return;

    let fontSize = parseFloat(getComputedStyle(label).fontSize);
    while (label.scrollWidth > label.clientWidth && fontSize > 12) {
        fontSize -= 1;
        label.style.fontSize = `${fontSize}px`;
    }
}

function updateSpeechDisplay() {
    speechDisplay.replaceChildren();

    if (state.path.length > 1) {
        state.path.slice(1).forEach((category) => {
            const categoryElement = document.createElement("span");
            categoryElement.className = "speech-word speech-category";
            categoryElement.textContent = category.name;
            speechDisplay.appendChild(categoryElement);
        });
    }

    state.sentence.forEach((word) => {
        const wordElement = document.createElement("span");
        wordElement.className = "speech-word";
        wordElement.textContent = word.name;
        speechDisplay.appendChild(wordElement);
    });

    if (speechDisplay.childElementCount === 0) {
        speechDisplay.textContent = "—";
    }
}

function handleItemClick(item) {
    if (item.type === "word") {
        state.sentence.push({ ...item, selectedCategoryId: getCurrentCategory().id });
        updateSpeechDisplay();
        playItemAudio(item).then((played) => {
            if (!played) speakTextAndWait(item.name);
        });
        return;
    }

    if (item.speak_enabled !== false) {
        playItemAudio(item).then((played) => {
            if (!played) speakTextAndWait(item.name);
        });
    }
    state.path.push(item);
    render();
}

function createAudioControls(item) {
    const controls = document.createElement("div");
    controls.className = "audio-controls";

    const recordButton = document.createElement("button");
    recordButton.className = "audio-button record-audio-button";
    recordButton.type = "button";
    recordButton.textContent = "🎙 NAGRAJ";
    recordButton.title = `Nagraj własną wymowę: ${item.name}`;
    recordButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (activeRecording?.item.id === item.id) {
            activeRecording.recorder.stop();
            return;
        }
        startRecording(item, recordButton);
    });
    controls.appendChild(recordButton);

    const playButton = document.createElement("button");
    playButton.className = "audio-button play-audio-button";
    playButton.type = "button";
    playButton.textContent = "▶ ODSŁUCHAJ";
    playButton.title = `Odsłuchaj nagranie: ${item.name}`;
    playButton.disabled = !item.audio_url;
    playButton.addEventListener("click", (event) => {
        event.stopPropagation();
        playItemAudio(item);
    });
    controls.appendChild(playButton);

    const editButton = document.createElement("button");
    editButton.className = "audio-button edit-item-button";
    editButton.type = "button";
    editButton.textContent = "✎ EDYTUJ";
    editButton.title = `Edytuj: ${item.name}`;
    editButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openEditDialog(item);
    });
    controls.appendChild(editButton);

    if (item.type === "category") {
        const deleteButton = document.createElement("button");
        deleteButton.className = "audio-button delete-category-button";
        deleteButton.type = "button";
        deleteButton.textContent = "× USUŃ";
        deleteButton.title = `Usuń kategorię ${item.name}`;
        deleteButton.addEventListener("click", (event) => {
            event.stopPropagation();
            deleteCategory(item);
        });
        controls.appendChild(deleteButton);
    } else {
        const deleteButton = document.createElement("button");
        deleteButton.className = "audio-button delete-category-button";
        deleteButton.type = "button";
        deleteButton.textContent = "× USUŃ";
        deleteButton.title = `Usuń słowo ${item.name}`;
        deleteButton.addEventListener("click", (event) => {
            event.stopPropagation();
            deleteWord(item);
        });
        controls.appendChild(deleteButton);
    }

    return controls;
}

function openEditDialog(item) {
    itemBeingEdited = item;
    editName.value = item.name;
    editEmoji.value = item.emoji || "";
    setPaletteValue(editPalette, editColor, item.color || "#86b88a");
    editSpeakRow.hidden = item.type !== "category";
    editSpeak.checked = item.speak_enabled !== false;
    editMessage.textContent = "";
    editDialog.showModal();
    editName.focus();
}

function closeEditDialog() {
    itemBeingEdited = null;
    editDialog.close();
}

async function saveEditedItem(event) {
    event.preventDefault();
    if (!itemBeingEdited || !editName.value.trim()) return;

    const table = itemBeingEdited.type === "category" ? "categories" : "words";
    const displayName = editName.value.trim().toUpperCase();
    const changes = {
        emoji: editEmoji.value.trim() || (table === "categories" ? "📁" : "💬"),
        color: editColor.value
    };
    if (table === "categories") {
        changes.name = displayName;
        changes.speak_enabled = editSpeak.checked;
    } else {
        changes.word = displayName;
    }

    const { error } = await supabaseClient
        .from(table)
        .update(changes)
        .eq("id", itemBeingEdited.id);

    if (error) {
        console.error("Nie udało się edytować elementu:", error);
        editMessage.textContent = `Nie udało się zapisać: ${error.message}`;
        return;
    }

    const storedItem = itemBeingEdited.type === "category"
        ? state.categories.find((category) => category.id === itemBeingEdited.id)
        : state.words.find((word) => word.id === itemBeingEdited.id);
    if (storedItem) {
        Object.assign(storedItem, changes);
        if (itemBeingEdited.type === "word") storedItem.word = changes.word;
    }
    closeEditDialog();
    render();
}

async function startRecording(item, recordButton) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        window.alert("Ta przeglądarka nie obsługuje nagrywania audio.");
        return;
    }

    if (activeRecording) {
        activeRecording.recorder.stop();
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        const recorder = new MediaRecorder(stream);
        activeRecording = { item, recorder };
        recordButton.textContent = "■ ZATRZYMAJ";

        recorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
        recorder.addEventListener("stop", async () => {
            stream.getTracks().forEach((track) => track.stop());
            activeRecording = null;
            recordButton.textContent = "🎙 NAGRAJ";
            await uploadItemAudio(item, new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        }, { once: true });
        recorder.start();
    } catch (error) {
        console.error("Nie udało się uruchomić mikrofonu:", error);
        window.alert("Nie udało się uruchomić mikrofonu. Sprawdź uprawnienia przeglądarki.");
    }
}

async function uploadItemAudio(item, audioBlob) {
    const table = item.type === "category" ? "categories" : "words";
    const filePath = `${table}/${item.id}.webm`;
    const { error: uploadError } = await supabaseClient.storage
        .from("word-audio")
        .upload(filePath, audioBlob, { contentType: audioBlob.type, upsert: true });

    if (uploadError) {
        console.error("Nie udało się wysłać nagrania:", uploadError);
        window.alert("Nie udało się zapisać nagrania w bazie.");
        return;
    }

    const { data: publicUrlData } = supabaseClient.storage.from("word-audio").getPublicUrl(filePath);
    const audioUrl = publicUrlData.publicUrl;
    const { error: updateError } = await supabaseClient
        .from(table)
        .update({ audio_url: audioUrl })
        .eq("id", item.id);

    if (updateError) {
        console.error("Nie udało się zapisać adresu nagrania:", updateError);
        window.alert("Plik wysłano, ale nie udało się zapisać go przy słowie.");
        return;
    }

    const storedItem = item.type === "category"
        ? state.categories.find((category) => category.id === item.id)
        : state.words.find((word) => word.id === item.id);
    if (storedItem) storedItem.audio_url = audioUrl;
    render();
}

async function deleteCategory(category) {
    if (!window.confirm(`Usunąć kategorię „${category.name}” wraz z jej zawartością?`)) return;

    const { error } = await supabaseClient
        .from("categories")
        .delete()
        .eq("id", category.id);

    if (error) {
        console.error("Nie udało się usunąć kategorii:", error);
        window.alert("Nie udało się usunąć kategorii z bazy.");
        return;
    }

    state.categories = state.categories.filter((item) => item.id !== category.id);
    state.words = state.words.filter((word) => word.category_id !== category.id);
    render();
}

async function deleteWord(word) {
    if (!window.confirm(`Usunąć słowo „${word.name}”?`)) return;

    const { error } = await supabaseClient
        .from("words")
        .delete()
        .eq("id", word.id);

    if (error) {
        console.error("Nie udało się usunąć słowa:", error);
        window.alert("Nie udało się usunąć słowa z bazy.");
        return;
    }

    state.words = state.words.filter((item) => item.id !== word.id);
    state.sentence = state.sentence.filter((item) => item.id !== word.id);
    render();
}

async function playItemAudio(item) {
    if (!item.audio_url) return false;
    const audio = new Audio(item.audio_url);
    try {
        await audio.play();
        return true;
    } catch (error) {
        console.error("Nie udało się odtworzyć nagrania:", error);
        return false;
    }
}

function openCategoryDialog() {
    categoryForm.reset();
    setPaletteValue(categoryPalette, categoryColor, "#86b88a");
    categorySpeak.checked = true;
    categoryMessage.textContent = "";
    categoryDialog.showModal();
    categoryName.focus();
}

function closeCategoryDialog() {
    categoryDialog.close();
}

function openWordDialog() {
    wordForm.reset();
    setPaletteValue(wordPalette, wordColor, "#86b88a");
    wordMessage.textContent = "";
    wordDialog.showModal();
    wordName.focus();
}

function closeWordDialog() {
    wordDialog.close();
}

async function createWord(event) {
    event.preventDefault();
    const name = wordName.value.trim();
    const categoryId = getCurrentCategory().id;
    if (!name || categoryId === null) {
        wordMessage.textContent = "Wejdź do kategorii, aby dodać słowo.";
        return;
    }

    const siblingWords = state.words.filter((word) => word.category_id === categoryId);
    const { data: newWord, error } = await supabaseClient
        .from("words")
        .insert({
            category_id: categoryId,
            word: name.toUpperCase(),
            phrase: null,
            emoji: wordEmoji.value.trim() || "💬",
            color: wordColor.value,
            sort_order: siblingWords.length + 1
        })
        .select("id, category_id, word, phrase, emoji, color, audio_url, sort_order")
        .single();

    if (error) {
        console.error("Nie udało się dodać słowa:", error);
        wordMessage.textContent = `Nie udało się zapisać: ${error.message}`;
        return;
    }

    state.words.push(newWord);
    closeWordDialog();
    render();
}

async function createCategory(event) {
    event.preventDefault();
    const name = categoryName.value.trim();
    if (!name) return;

    const parentId = getCurrentCategory().id;
    const siblingCategories = state.categories.filter((category) => category.parent_id === parentId);
    const { data: newCategory, error } = await supabaseClient
        .from("categories")
        .insert({
            name: name.toUpperCase(),
            emoji: categoryEmoji.value.trim() || "📁",
            color: categoryColor.value,
            speak_enabled: categorySpeak.checked,
            parent_id: parentId,
            sort_order: siblingCategories.length + 1
        })
        .select("id, name, emoji, color, audio_url, speak_enabled, parent_id, sort_order")
        .single();

    if (error) {
        console.error("Nie udało się dodać kategorii:", error);
        categoryMessage.textContent = `Nie udało się zapisać: ${error.message}`;
        return;
    }

    state.categories.push(newCategory);
    closeCategoryDialog();
    render();
}

function goToStart() {
    state.path = [rootCategory];
    state.sentence = [];
    render();
}

function goBack() {
    if (state.path.length > 1) {
        const leavingCategory = getCurrentCategory();
        state.sentence = state.sentence.filter((word) => word.selectedCategoryId !== leavingCategory.id);
        state.path.pop();
        render();
    }
}

function deleteLastWord() {
    if (state.sentence.length > 0) {
        state.sentence.pop();
        updateSpeechDisplay();
    }
}

async function speak() {
    const speechItems = [
        ...state.path.slice(1).filter((category) => category.speak_enabled !== false),
        ...state.sentence
    ];
    if (speechItems.length === 0) return;
    window.speechSynthesis.cancel();
    for (const item of speechItems) {
        const played = item.audio_url && await playAudioAndWait(item.audio_url);
        if (!played) {
            await speakTextAndWait(item.name);
        }
    }
}

function playAudioAndWait(url) {
    return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.addEventListener("ended", () => resolve(true), { once: true });
        audio.addEventListener("error", () => resolve(false), { once: true });
        audio.play().catch(() => resolve(false));
    });
}

function speakTextAndWait(text) {
    return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "pl-PL";
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.addEventListener("end", resolve, { once: true });
        window.speechSynthesis.speak(utterance);
    });
}

function isLightColor(color) {
    const hex = color.replace("#", "");
    const red = parseInt(hex.substring(0, 2), 16);
    const green = parseInt(hex.substring(2, 4), 16);
    const blue = parseInt(hex.substring(4, 6), 16);
    return (red * 299 + green * 587 + blue * 114) / 1000 > 160;
}

function shadeColor(color, percent) {
    const hex = color.replace("#", "");
    let red = parseInt(hex.substring(0, 2), 16);
    let green = parseInt(hex.substring(2, 4), 16);
    let blue = parseInt(hex.substring(4, 6), 16);
    red = Math.max(0, Math.min(255, red + (red * percent) / 100));
    green = Math.max(0, Math.min(255, green + (green * percent) / 100));
    blue = Math.max(0, Math.min(255, blue + (blue * percent) / 100));
    return "#" + ((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1);
}

document.getElementById("btnStart").addEventListener("click", goToStart);
document.getElementById("btnBack").addEventListener("click", goBack);
document.getElementById("btnDelete").addEventListener("click", deleteLastWord);
document.getElementById("btnSpeak").addEventListener("click", speak);
categoryForm.addEventListener("submit", createCategory);
document.getElementById("btnCancelCategory").addEventListener("click", closeCategoryDialog);
wordForm.addEventListener("submit", createWord);
document.getElementById("btnCancelWord").addEventListener("click", closeWordDialog);
editForm.addEventListener("submit", saveEditedItem);
document.getElementById("btnCancelEdit").addEventListener("click", closeEditDialog);

setupColorPalette(categoryPalette, categoryColor);
setupColorPalette(wordPalette, wordColor);
setupColorPalette(editPalette, editColor);
setPaletteValue(categoryPalette, categoryColor, "#86b88a");
setPaletteValue(wordPalette, wordColor, "#86b88a");

loadData();
