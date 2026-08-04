document.addEventListener("DOMContentLoaded", () => {
    const toggleChat = document.getElementById("toggleChat");
    const closeChat = document.getElementById("closeChat");
    const chatWindow = document.getElementById("chatWindow");

    if (toggleChat && closeChat && chatWindow) {
        // Alterna exibição do chat ao clicar no botão
        toggleChat.addEventListener("click", () => {
            chatWindow.classList.toggle("hidden");
        });

        // Esconde o chat ao clicar no X
        closeChat.addEventListener("click", () => {
            chatWindow.classList.add("hidden");
        });
    }
});
