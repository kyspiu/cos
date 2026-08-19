const data = {
    id: "root",
    name: "Kategorie główne",
    type: "category",
    emoji: "🏠",
    color: "#4b5563",
    children: [
        {
            id: "rozkaz",
            name: "ROZKAZ",
            type: "category",
            emoji: "📢",
            color: "#ef4444",
            children: []
        },
        {
            id: "zapytanie",
            name: "ZAPYTANIE",
            type: "category",
            emoji: "❓",
            color: "#f59e0b",
            children: []
        },
        {
            id: "stwierdzenie",
            name: "STWIERDZENIE",
            type: "category",
            emoji: "✅",
            color: "#3b82f6",
            children: []
        },
        {
            id: "ja",
            name: "JA",
            type: "category",
            emoji: "🧑",
            color: "#8b5cf6",
            children: [
                {
                    id: "emocje",
                    name: "EMOCJE",
                    type: "category",
                    emoji: "❤️",
                    color: "#ec4899",
                    children: [
                        { id: "szczesliwa", name: "SZCZĘŚLIWA", type: "word", emoji: "😊", color: "#fbbf24" },
                        { id: "smutna", name: "SMUTNA", type: "word", emoji: "😢", color: "#60a5fa" },
                        { id: "zla", name: "ZŁA", type: "word", emoji: "😠", color: "#f87171" },
                        { id: "przestraszona", name: "PRZESTRASZONA", type: "word", emoji: "😨", color: "#a78bfa" }
                    ]
                },
                {
                    id: "potrzeby",
                    name: "POTRZEBY",
                    type: "category",
                    emoji: "🤲",
                    color: "#10b981",
                    children: [
                        { id: "jedzenie", name: "JEDZENIE", type: "word", emoji: "🍽️", color: "#f59e0b" },
                        { id: "picie", name: "PICIE", type: "word", emoji: "🥤", color: "#3b82f6" },
                        { id: "toaleta", name: "TOALETA", type: "word", emoji: "🚻", color: "#8b5cf6" },
                        { id: "odpoczynek", name: "ODPOCZYNEK", type: "word", emoji: "🛌", color: "#6b7280" }
                    ]
                },
                {
                    id: "bol",
                    name: "BÓL",
                    type: "category",
                    emoji: "🤕",
                    color: "#f97316",
                    children: [
                        { id: "glowa", name: "GŁOWA", type: "word", emoji: "🤯", color: "#f87171" },
                        { id: "brzuch", name: "BRZUCH", type: "word", emoji: "🤰", color: "#fb923c" },
                        { id: "noga", name: "NOGA", type: "word", emoji: "🦵", color: "#a78bfa" },
                        { id: "reka", name: "RĘKA", type: "word", emoji: "🖐️", color: "#60a5fa" }
                    ]
                },
                {
                    id: "czynnosci",
                    name: "CZYNNOŚCI",
                    type: "category",
                    emoji: "🏃",
                    color: "#06b6d4",
                    children: [
                        { id: "chce", name: "CHCĘ", type: "word", emoji: "👍", color: "#22c55e" },
                        { id: "niechce", name: "NIE CHCĘ", type: "word", emoji: "👎", color: "#ef4444" },
                        { id: "spie", name: "ŚPIĘ", type: "word", emoji: "😴", color: "#818cf8" },
                        { id: "wstaje", name: "WSTAJĘ", type: "word", emoji: "🧍", color: "#fbbf24" }
                    ]
                }
            ]
        }
    ]
};

const savedData = localStorage.getItem("komunikator-data");
if (savedData) {
    try {
        const parsedData = JSON.parse(savedData);
        if (parsedData && Array.isArray(parsedData.children)) {
            data.children = parsedData.children;
        }
    } catch (error) {
        localStorage.removeItem("komunikator-data");
    }
}

const state = {
    path: [data],
    sentence: []
};

const grid = document.getElementById("grid");
const speechDisplay = document.getElementById("speechDisplay");
const categoryPath = document.getElementById("categoryPath");
const addForm = document.getElementById("addForm");
const addTarget = document.getElementById("addTarget");
const formMessage = document.getElementById("formMessage");
const editDialog = document.getElementById("editDialog");
const editForm = document.getElementById("editForm");
const editName = document.getElementById("editName");
const editEmoji = document.getElementById("editEmoji");
const editColor = document.getElementById("editColor");
let itemBeingEdited = null;

function getCurrentNode() {
    return state.path[state.path.length - 1];
}

function render() {
    const current = getCurrentNode();
    const items = current.children || [];

    grid.innerHTML = "";

    items.forEach((item) => {
        const cardShell = document.createElement("div");
        cardShell.className = "card-shell";

        const card = document.createElement("button");
        card.className = `card card-${item.type}`;
        card.style.backgroundColor = item.color;
        card.style.borderColor = shadeColor(item.color, -20);
        card.style.color = isLightColor(item.color) ? "#111827" : "#ffffff";
        card.setAttribute("type", "button");

        const emoji = document.createElement("span");
        emoji.className = "card-emoji";
        emoji.textContent = item.emoji;

        const label = document.createElement("span");
        label.className = "card-label";
        label.textContent = item.name;

        const typeLabel = document.createElement("span");
        typeLabel.className = "card-type";
        typeLabel.textContent = item.type === "category" ? "KATEGORIA" : "SŁOWO";

        card.appendChild(emoji);
        card.appendChild(label);
        card.appendChild(typeLabel);

        card.addEventListener("click", () => handleItemClick(item));

        const controls = document.createElement("div");
        controls.className = "card-controls";
        controls.appendChild(createControlButton("✎", "Edytuj", () => openEditDialog(item)));
        controls.appendChild(createControlButton("↑", "Przesuń wyżej", () => moveItem(item, -1)));
        controls.appendChild(createControlButton("↓", "Przesuń niżej", () => moveItem(item, 1)));
        controls.appendChild(createControlButton("×", "Usuń", () => deleteItem(item)));

        cardShell.appendChild(card);
        cardShell.appendChild(controls);
        grid.appendChild(cardShell);
    });

    if (items.length === 0) {
        const emptyState = document.createElement("p");
        emptyState.className = "empty-state";
        emptyState.textContent = "Ta kategoria jest pusta. Dodaj pierwszy element poniżej.";
        grid.appendChild(emptyState);
    }

    updatePathText();
    updateAddTarget();
    updateSpeechDisplay();
}

function createControlButton(symbol, label, action) {
    const button = document.createElement("button");
    button.className = "card-control";
    button.type = "button";
    button.textContent = symbol;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        action();
    });
    return button;
}

function updateAddTarget() {
    addTarget.textContent = getCurrentNode().name;
}

function updatePathText() {
    if (state.path.length === 1) {
        categoryPath.textContent = "Kategorie główne";
        return;
    }
    const names = state.path.map((node) => node.name);
    categoryPath.textContent = "Jesteś w: " + names.slice(1).join(" → ");
}

function updateSpeechDisplay() {
    if (state.sentence.length === 0) {
        speechDisplay.textContent = "—";
    } else {
        speechDisplay.textContent = state.sentence.map((w) => w.name).join(" ");
    }
}

function handleItemClick(item) {
    if (item.type === "word") {
        state.sentence.push(item);
        updateSpeechDisplay();
    } else if (item.type === "category") {
        if (state.path.length > 1) {
            state.sentence.push(item);
        }
        state.path.push(item);
        render();
    }
}

function addItem(event) {
    event.preventDefault();

    const nameInput = document.getElementById("itemName");
    const emojiInput = document.getElementById("itemEmoji");
    const typeInput = document.getElementById("itemType");
    const colorInput = document.getElementById("itemColor");
    const name = nameInput.value.trim();

    if (!name) return;

    const item = {
        id: `${typeInput.value}-${Date.now()}`,
        name: name.toUpperCase(),
        type: typeInput.value,
        emoji: emojiInput.value.trim() || (typeInput.value === "category" ? "📁" : "💬"),
        color: colorInput.value
    };

    if (item.type === "category") item.children = [];
    getCurrentNode().children = getCurrentNode().children || [];
    getCurrentNode().children.push(item);
    localStorage.setItem("komunikator-data", JSON.stringify(data));

    addForm.reset();
    colorInput.value = "#0ea5e9";
    formMessage.textContent = `Dodano: ${item.name}`;
    render();
}

function getCurrentItems() {
    const current = getCurrentNode();
    current.children = current.children || [];
    return current.children;
}

function saveData() {
    localStorage.setItem("komunikator-data", JSON.stringify(data));
}

function findItemIndex(item) {
    return getCurrentItems().findIndex((currentItem) => currentItem.id === item.id);
}

function moveItem(item, direction) {
    const items = getCurrentItems();
    const index = findItemIndex(item);
    const targetIndex = index + direction;

    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;

    [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
    saveData();
    render();
}

function deleteItem(item) {
    if (!window.confirm(`Usunąć „${item.name}”?`)) return;

    const items = getCurrentItems();
    const index = findItemIndex(item);
    if (index < 0) return;

    items.splice(index, 1);
    state.sentence = state.sentence.filter((sentenceItem) => sentenceItem.id !== item.id);
    saveData();
    render();
}

function openEditDialog(item) {
    itemBeingEdited = item;
    editName.value = item.name;
    editEmoji.value = item.emoji;
    editColor.value = item.color;
    editDialog.showModal();
    editName.focus();
}

function closeEditDialog() {
    itemBeingEdited = null;
    editDialog.close();
}

function saveEditedItem(event) {
    event.preventDefault();
    if (!itemBeingEdited || !editName.value.trim()) return;

    itemBeingEdited.name = editName.value.trim().toUpperCase();
    itemBeingEdited.emoji = editEmoji.value.trim() || "💬";
    itemBeingEdited.color = editColor.value;
    saveData();
    closeEditDialog();
    render();
}

function goToStart() {
    state.path = [data];
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
    const text = state.sentence.map((w) => w.name).join(" ");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pl-PL";
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

function isLightColor(color) {
    const hex = color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 160;
}

function shadeColor(color, percent) {
    const hex = color.replace("#", "");
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    r = Math.max(0, Math.min(255, r + (r * percent) / 100));
    g = Math.max(0, Math.min(255, g + (g * percent) / 100));
    b = Math.max(0, Math.min(255, b + (b * percent) / 100));

    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

document.getElementById("btnStart").addEventListener("click", goToStart);
document.getElementById("btnBack").addEventListener("click", goBack);
document.getElementById("btnDelete").addEventListener("click", deleteLastWord);
document.getElementById("btnClear").addEventListener("click", clearSentence);
document.getElementById("btnSpeak").addEventListener("click", speak);
addForm.addEventListener("submit", addItem);
editForm.addEventListener("submit", saveEditedItem);
document.getElementById("btnCancelEdit").addEventListener("click", closeEditDialog);

render();