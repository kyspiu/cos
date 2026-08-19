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
const categoryMessage = document.getElementById("categoryMessage");
let activeRecording = null;

function getCurrentCategory() {
    return state.path[state.path.length - 1];
}

async function loadData() {
    const [categoriesResult, wordsResult] = await Promise.all([
        supabaseClient.from("categories").select("id, name, emoji, color, audio_url, parent_id, sort_order").order("sort_order"),
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
        card.style.backgroundColor = item.color || "#0ea5e9";
        card.style.borderColor = shadeColor(item.color || "#0ea5e9", -20);
        card.style.color = isLightColor(item.color || "#0ea5e9") ? "#111827" : "#ffffff";
        card.type = "button";

        const emoji = document.createElement("span");
        emoji.className = "card-emoji";
        emoji.textContent = item.emoji || (item.type === "category" ? "📁" : "💬");

        const label = document.createElement("span");
        label.className = "card-label";
        label.textContent = item.name;

        const typeLabel = document.createElement("span");
        typeLabel.className = "card-type";
        typeLabel.textContent = item.type === "category" ? "KATEGORIA" : "SŁOWO";

        card.append(emoji, label, typeLabel);
        card.addEventListener("click", () => handleItemClick(item));
        cardShell.appendChild(card);

        cardShell.appendChild(createAudioControls(item));
        grid.appendChild(cardShell);
    });

    if (items.length === 0) {
        const emptyState = document.createElement("p");
        emptyState.className = "empty-state";
        emptyState.textContent = "Ta kategoria jest pusta.";
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

function updateSpeechDisplay() {
    if (state.sentence.length > 0) {
        speechDisplay.textContent = state.sentence.map((word) => word.name).join(" ");
    } else if (state.path.length > 1) {
        speechDisplay.textContent = getCurrentCategory().name;
    } else {
        speechDisplay.textContent = "—";
    }
}

function handleItemClick(item) {
    if (item.type === "word") {
        state.sentence.push(item);
        updateSpeechDisplay();
        playItemAudio(item);
        return;
    }

    state.path.push(item);
    render();
}

function createAudioControls(item) {
    const controls = document.createElement("div");
    controls.className = "audio-controls";

    const recordButton = document.createElement("button");
    recordButton.className = "audio-button";
    recordButton.type = "button";
    recordButton.textContent = "🎙 NAGRAJ";
    recordButton.title = `Nagraj wymowę: ${item.name}`;
    recordButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (activeRecording?.item.id === item.id) {
            activeRecording.recorder.stop();
        } else {
            startRecording(item, recordButton);
        }
    });
    controls.appendChild(recordButton);

    if (item.audio_url) {
        const playButton = document.createElement("button");
        playButton.className = "audio-button";
        playButton.type = "button";
        playButton.textContent = "▶ ODTWÓRZ";
        playButton.title = `Odtwórz wymowę: ${item.name}`;
        playButton.addEventListener("click", (event) => {
            event.stopPropagation();
            playItemAudio(item);
        });
        controls.appendChild(playButton);
    }

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
    }

    return controls;
}

async function startRecording(item, recordButton) {
    if (!navigator.mediaDevices?.getUserMedia) {
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

function playItemAudio(item) {
    if (!item.audio_url) return;
    const audio = new Audio(item.audio_url);
    audio.play().catch((error) => console.error("Nie udało się odtworzyć nagrania:", error));
}

function openCategoryDialog() {
    categoryForm.reset();
    categoryColor.value = "#0ea5e9";
    categoryMessage.textContent = "";
    categoryDialog.showModal();
    categoryName.focus();
}

function closeCategoryDialog() {
    categoryDialog.close();
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
            parent_id: parentId,
            sort_order: siblingCategories.length + 1
        })
        .select("id, name, emoji, color, parent_id, sort_order")
        .single();

    if (error) {
        console.error("Nie udało się dodać kategorii:", error);
        categoryMessage.textContent = "Nie udało się zapisać kategorii w bazie.";
        return;
    }

    state.categories.push(newCategory);
    closeCategoryDialog();
    render();
}

function goToStart() {
    state.path = [rootCategory];
    render();
}

function goBack() {
    if (state.path.length > 1) {
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

function clearSentence() {
    state.sentence = [];
    updateSpeechDisplay();
}

async function speak() {
    if (state.sentence.length === 0) return;
    window.speechSynthesis.cancel();
    for (const word of state.sentence) {
        if (word.audio_url) {
            await playAudioAndWait(word.audio_url);
        } else {
            await speakTextAndWait(word.name);
        }
    }
}

function playAudioAndWait(url) {
    return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.addEventListener("ended", resolve, { once: true });
        audio.addEventListener("error", resolve, { once: true });
        audio.play().catch(resolve);
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
document.getElementById("btnClear").addEventListener("click", clearSentence);
document.getElementById("btnSpeak").addEventListener("click", speak);
categoryForm.addEventListener("submit", createCategory);
document.getElementById("btnCancelCategory").addEventListener("click", closeCategoryDialog);

loadData();
