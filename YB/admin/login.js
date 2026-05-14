const form = document.querySelector("#loginForm");
const usernameInput = document.querySelector("#loginUsername");
const passwordInput = document.querySelector("#loginPassword");
const submitButton = document.querySelector("#loginSubmit");
const statusEl = document.querySelector("#loginStatus");

function defaultApiBase() {
  if (window.location.port === "3001") return "http://localhost:3000";
  return window.location.origin;
}

function apiUrl(path) {
  return `${defaultApiBase().replace(/\/$/, "")}${path}`;
}

function setStatus(text, ok = true) {
  statusEl.textContent = text;
  statusEl.style.background = ok ? "rgba(34, 197, 94, 0.13)" : "rgba(239, 68, 68, 0.16)";
  statusEl.style.color = ok ? "#86efac" : "#fecaca";
}

// 已经登录直接跳首页
async function checkAlreadyLoggedIn() {
  try {
    const response = await fetch(apiUrl("/api/admin/me"), { credentials: "include" });
    if (response.ok) {
      window.location.replace("./");
    }
  } catch (error) {
    // 网络错误忽略,正常显示登录页
  }
}

async function onSubmit(event) {
  event.preventDefault();
  submitButton.disabled = true;
  setStatus("登录中...");

  try {
    const response = await fetch(apiUrl("/api/admin/login"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        password: passwordInput.value
      })
    });

    if (response.status === 401) {
      setStatus("账号或密码错误", false);
      passwordInput.select();
      return;
    }
    if (!response.ok) {
      setStatus(`登录失败:HTTP ${response.status}`, false);
      return;
    }

    setStatus("登录成功,跳转中...");
    // 登录成功,跳到管理首页(带一个 query 规避浏览器历史回退到登录页)
    const next = new URLSearchParams(window.location.search).get("next") || "./";
    window.location.replace(next);
  } catch (error) {
    setStatus(`网络错误:${error.message}`, false);
  } finally {
    submitButton.disabled = false;
  }
}

form.addEventListener("submit", onSubmit);
checkAlreadyLoggedIn();
