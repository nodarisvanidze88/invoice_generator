import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Box, InvoiceLine } from "../../api/types";
import { cn } from "../../components/ui";
import { formatInt } from "../../lib/format";
import { lineDescription } from "../../lib/invoice";

const UNIT_GAP = 0.94;
const DIMMED_OPACITY = 0.08;
const VIEW_HEIGHT = 460;
const GOLDEN_ANGLE = 137.508;

export function lineColor(index: number): string {
  return `hsl(${Math.round((index * GOLDEN_ANGLE) % 360)}, 65%, 55%)`;
}

interface LegendEntry {
  lineId: string;
  label: string;
  qty: number;
  color: string;
}

export default function Box3DView({ box, lines }: { box: Box; lines: InvoiceLine[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const meshesRef = useRef<Map<string, THREE.InstancedMesh>>(new Map());

  const legend = useMemo<LegendEntry[]>(() => {
    const byId = new Map(lines.map((line) => [line.id, line]));
    const order: string[] = [];
    const qty = new Map<string, number>();
    for (const p of box.placements) {
      if (!qty.has(p.line_id)) order.push(p.line_id);
      qty.set(p.line_id, (qty.get(p.line_id) ?? 0) + p.nx * p.ny * p.nz);
    }
    return order.map((lineId, index) => {
      const line = byId.get(lineId);
      return { lineId, label: line ? lineDescription(line) : lineId, qty: qty.get(lineId) ?? 0, color: lineColor(index) };
    });
  }, [box.placements, lines]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const [length, width, height] = [box.length_cm ?? 1, box.width_cm ?? 1, box.height_cm ?? 1];
    const width3d = mount.clientWidth;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width3d, VIEW_HEIGHT);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(length, height * 2, width * 1.5);
    scene.add(sun);

    const centre = new THREE.Vector3(length / 2, height / 2, width / 2);
    const span = Math.max(length, width, height);
    const camera = new THREE.PerspectiveCamera(40, width3d / VIEW_HEIGHT, 0.1, span * 20);
    camera.position.set(length * 1.6, height * 1.5, width * 2.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(centre);
    controls.enableDamping = true;
    controls.update();

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(length, height, width)),
      new THREE.LineBasicMaterial({ color: 0x334155 }),
    );
    outline.position.copy(centre);
    scene.add(outline);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(length, width),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0, side: THREE.DoubleSide }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(length / 2, 0, width / 2);
    scene.add(floor);

    const colorByLine = new Map(legend.map((entry) => [entry.lineId, entry.color]));
    const unitsByLine = new Map<string, THREE.Matrix4[]>();
    const sizeByLine = new Map<string, THREE.Vector3>();
    const matrix = new THREE.Matrix4();
    for (const p of box.placements) {
      const list = unitsByLine.get(p.line_id) ?? [];
      sizeByLine.set(p.line_id, new THREE.Vector3(p.dx, p.dz, p.dy));
      for (let i = 0; i < p.nx; i++)
        for (let j = 0; j < p.ny; j++)
          for (let k = 0; k < p.nz; k++) {
            matrix.makeScale(p.dx * UNIT_GAP, p.dz * UNIT_GAP, p.dy * UNIT_GAP);
            matrix.setPosition(p.x + (i + 0.5) * p.dx, p.z + (k + 0.5) * p.dz, p.y + (j + 0.5) * p.dy);
            list.push(matrix.clone());
          }
      unitsByLine.set(p.line_id, list);
    }
    const cube = new THREE.BoxGeometry(1, 1, 1);
    const meshes = new Map<string, THREE.InstancedMesh>();
    for (const [lineId, matrices] of unitsByLine) {
      const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(colorByLine.get(lineId) ?? "#94a3b8"), transparent: true });
      const mesh = new THREE.InstancedMesh(cube, material, matrices.length);
      matrices.forEach((m, index) => mesh.setMatrixAt(index, m));
      mesh.userData.lineId = lineId;
      scene.add(mesh);
      meshes.set(lineId, mesh);
    }
    meshesRef.current = meshes;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...meshes.values()], false)[0];
      setHovered(hit ? (hit.object.userData.lineId as string) : null);
    };
    renderer.domElement.addEventListener("pointermove", onMove);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth;
      renderer.setSize(w, VIEW_HEIGHT);
      camera.aspect = w / VIEW_HEIGHT;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onMove);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const material = object.material as THREE.Material | THREE.Material[];
          (Array.isArray(material) ? material : [material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [box, legend]);

  useEffect(() => {
    for (const [lineId, mesh] of meshesRef.current) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      material.opacity = focus && focus !== lineId ? DIMMED_OPACITY : 1;
      material.depthWrite = !focus || focus === lineId;
    }
  }, [focus, box, legend]);

  const hoveredEntry = legend.find((entry) => entry.lineId === hovered);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-slate-50 to-slate-100 ring-1 ring-slate-200">
        <div ref={mountRef} style={{ height: VIEW_HEIGHT }} />
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs text-slate-600 shadow-sm">
          Drag to rotate · scroll to zoom · right-drag to pan
        </div>
        {hoveredEntry && (
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-[80%] rounded-lg bg-slate-900/90 px-3 py-2 text-xs text-white">
            {hoveredEntry.label} · {formatInt(hoveredEntry.qty)} pcs
          </div>
        )}
      </div>
      <ul className="scrollbar-thin max-h-[460px] space-y-1 overflow-y-auto">
        {legend.map((entry) => (
          <li key={entry.lineId}>
            <button
              type="button"
              onClick={() => setFocus(focus === entry.lineId ? null : entry.lineId)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                focus === entry.lineId ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-slate-50",
              )}
            >
              <span className="mt-0.5 size-3 shrink-0 rounded-sm" style={{ background: entry.color }} />
              <span className="min-w-0 flex-1 text-slate-700">{entry.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatInt(entry.qty)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
