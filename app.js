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

function getCurrentCategory() {
    return state.path[state.path.length - 1];
}

async function loadData() {
    const [{ data: categories, error: categoriesError }, { data: words, error: wordsError }] = await Promise.all([
        supabaseClient.from("categories").select("id, name, emoji, color, parent_id, sort_order").order("sort_order"),
        supabaseClient.from("words").select("id, category_id, word, phrase, emoji, color, sort_order").order("sort_order")
    ]);

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
    speechDisplay.textContent = state.sentence.length === 0
        ? "—"
        : state.sentence.map((word) => word.name).join(" ");
}

function handleItemClick(item) {
    if (item.type === "word") {
        state.sentence.push(item);
        updateSpeechDisplay();
        return;
    }

    state.path.push(item);
    render();
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

function speak() {
    if (state.sentence.length === 0) return;
    const utterance = new SpeechSynthesisUtterance(state.sentence.map((word) => word.name).join(" "));
    utterance.lang = "pl-PL";
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
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
