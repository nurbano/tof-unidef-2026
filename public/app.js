const SVG_NS = "http://www.w3.org/2000/svg";

const state = { system: "tof", yaw: "all", data: [], selectedAttempt: null };

const systems = {
  tof: { key: "error_tof_mm", label: "VL53L5CX", color: "#BE560D" },
  l515: { key: "error_l515_mm", label: "L515", color: "#176FBA" },
  rgb: { key: "error_rgb_mm", label: "RGB–ArUco", color: "#1BAF7A" },
};

const distances = [0.5, 1, 1.5, 2, 2.5, 3];

function element(name, attributes = {}, text = "") {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderChart() {
  const svg = document.querySelector("#error-chart");
  svg.querySelectorAll(":scope > :not(title):not(desc)").forEach((node) => node.remove());

  const width = 920;
  const height = 460;
  const margin = { top: 32, right: 32, bottom: 68, left: 78 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const yMin = -60;
  const yMax = 130;
  const xScale = (distance) => margin.left + ((distance - 0.5) / 2.5) * innerWidth;
  const yScale = (value) => margin.top + ((yMax - value) / (yMax - yMin)) * innerHeight;

  [-50, 0, 50, 100].forEach((tick) => {
    const y = yScale(tick);
    svg.append(element("line", { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: tick === 0 ? "chart-zero" : "chart-grid" }));
    svg.append(element("text", { x: margin.left - 12, y: y + 5, "text-anchor": "end", class: "chart-label" }, String(tick)));
  });

  distances.forEach((distance) => {
    const x = xScale(distance);
    svg.append(element("line", { x1: x, y1: margin.top, x2: x, y2: height - margin.bottom, class: "chart-grid", opacity: ".45" }));
    svg.append(element("text", { x, y: height - margin.bottom + 28, "text-anchor": "middle", class: "chart-label" }, String(distance).replace(".", ",")));
  });

  svg.append(element("line", { x1: margin.left, y1: margin.top, x2: margin.left, y2: height - margin.bottom, class: "chart-axis" }));
  svg.append(element("line", { x1: margin.left, y1: height - margin.bottom, x2: width - margin.right, y2: height - margin.bottom, class: "chart-axis" }));
  svg.append(element("text", { x: margin.left + innerWidth / 2, y: height - 16, "text-anchor": "middle", class: "chart-title" }, "Distancia nominal (m)"));
  const yLabel = element("text", { x: 19, y: margin.top + innerHeight / 2, "text-anchor": "middle", class: "chart-title", transform: `rotate(-90 19 ${margin.top + innerHeight / 2})` }, "Error con signo (mm)");
  svg.append(yLabel);

  const system = systems[state.system];
  const filtered = state.data.filter((row) => state.yaw === "all" || row.yaw_deg === Number(state.yaw));
  const selectable = filtered.filter((row) => row[system.key] !== null);
  if (!selectable.some((row) => row.attempt_id === state.selectedAttempt)) {
    state.selectedAttempt = selectable.length ? selectable[0].attempt_id : null;
  }
  const meanPoints = [];
  distances.forEach((distance) => {
    const values = filtered.filter((row) => row.distance_m === distance && row[system.key] !== null).map((row) => row[system.key]);
    if (values.length) meanPoints.push([xScale(distance), yScale(average(values))]);
  });
  if (meanPoints.length) {
    svg.append(element("polyline", { points: meanPoints.map(([x, y]) => `${x},${y}`).join(" "), class: "chart-line", stroke: system.color }));
  }

  const repetitionOffset = [-14, -7, 0, 7, 14];
  filtered.forEach((row) => {
    const error = row[system.key];
    if (error === null) return;
    const cx = xScale(row.distance_m) + repetitionOffset[row.repetition - 1];
    const cy = yScale(error);
    const group = element("g", {
      class: "chart-point-group", tabindex: "0", role: "button",
      "aria-label": `${system.label}, ${row.distance_m} metros, yaw ${row.yaw_deg} grados, error ${error.toFixed(1)} milímetros`,
    });
    const hit = element("circle", { cx, cy, r: 15, class: "chart-hit" });
    const circle = element("circle", {
      cx, cy, r: 6, fill: system.color,
      class: `chart-point${row.attempt_id === state.selectedAttempt ? " selected" : ""}`,
    });
    const selectPoint = () => {
      state.selectedAttempt = row.attempt_id;
      svg.querySelectorAll(".chart-point.selected").forEach((point) => point.classList.remove("selected"));
      circle.classList.add("selected");
      showDetail(row, system);
    };
    group.addEventListener("click", selectPoint);
    group.addEventListener("focus", selectPoint);
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectPoint();
      }
    });
    group.append(hit, circle);
    svg.append(group);
  });

  const selected = selectable.find((row) => row.attempt_id === state.selectedAttempt);
  if (selected) showDetail(selected, system);

  if (state.system === "tof") {
    distances.forEach((distance) => {
      const rowsAtDistance = filtered.filter((row) => row.distance_m === distance);
      const available = rowsAtDistance.filter((row) => row.error_tof_mm !== null).length;
      const total = rowsAtDistance.length;
      svg.append(element("text", {
        x: xScale(distance), y: height - margin.bottom + 48, "text-anchor": "middle",
        fill: available < total ? "#BE560D" : "#5D6670", "font-size": "12", "font-weight": available < total ? "700" : "400",
      }, `${available}/${total}`));
    });
  }
}

function showDetail(row, system) {
  const error = row[system.key];
  const detail = document.querySelector("#point-detail");
  const zones = state.system === "tof" ? `<p><strong>Zonas ToF utilizadas:</strong> ${row.tof_observed_zones}</p>` : "";
  detail.innerHTML = `
    <p class="eyebrow">${system.label}</p>
    <div class="detail-value">${error.toFixed(1).replace(".", ",")} mm</div>
    <p><strong>Distancia:</strong> ${String(row.distance_m).replace(".", ",")} m</p>
    <p><strong>Yaw:</strong> ${row.yaw_deg}° · <strong>Repetición:</strong> ${row.repetition}</p>
    ${zones}
  `;
}

document.querySelectorAll("[data-system]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-system]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.system = button.dataset.system;
    renderChart();
  });
});

document.querySelectorAll("[data-yaw]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-yaw]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.yaw = button.dataset.yaw;
    renderChart();
  });
});

fetch("assets/datos_interactivos.json")
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    state.data = data;
    renderChart();
  })
  .catch((error) => {
    const detail = document.querySelector("#point-detail");
    detail.innerHTML = `<h3>No se pudieron cargar los datos</h3><p>${error.message}. Abra el sitio mediante un servidor HTTP local.</p>`;
  });
