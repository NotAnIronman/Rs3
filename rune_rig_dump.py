"""Run in Blender's Text Editor with your imported armature selected.

Reads the rig and bound meshes; writes a ZIP and a short text report.
No bones, weights, modifiers, actions, selections, or saved files are edited.
Optional timeline evaluation temporarily changes the frame and restores it.
"""

import bpy
import io
import json
import re
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from mathutils import Color, Euler, Matrix, Quaternion, Vector


# Optional: enter an absolute directory, e.g. r"D:\Models\Diagnostics".
# Blank uses a folder beside the saved .blend, or the system temporary directory.
OUTPUT_DIRECTORY = ""
INCLUDE_GEOMETRY = True
SAMPLE_CURRENT_TIMELINE = True
MAX_TIMELINE_SAMPLES = 24
WEIGHT_EPSILON = 1e-6
SCHEMA_VERSION = 1
SCRIPT_VERSION = "1.1"
BLENDER_SEQUENCE_TYPES = (Color, Euler, Matrix, Quaternion, Vector)


def json_default(value):
    """Convert Blender math values, including Matrix rows, without losing numbers."""
    if isinstance(value, BLENDER_SEQUENCE_TYPES):
        return list(value)
    if isinstance(value, (set, frozenset)):
        return sorted(value)
    raise TypeError(f"Unsupported report value: {type(value).__name__}")


def plain_setting(value):
    """Snapshot RNA arrays recursively; list(Matrix) alone leaves Vector rows."""
    if isinstance(value, (bool, int, float, str)) or value is None:
        return value
    if isinstance(value, (set, frozenset)):
        return [plain_setting(x) for x in sorted(value)]
    return [plain_setting(x) for x in value]


def matrix_rows(matrix):
    return [[float(x) for x in row] for row in matrix]


def vector_values(vector):
    return [float(x) for x in vector]


def simple_settings(item):
    """Read primitive RNA settings without following pointers or file paths."""
    result = {}
    for prop in item.bl_rna.properties:
        if prop.identifier in {"rna_type", "filepath", "directory"}:
            continue
        if getattr(prop, "subtype", "") in {"FILE_PATH", "DIR_PATH"}:
            continue
        if prop.type not in {"BOOLEAN", "INT", "FLOAT", "STRING", "ENUM"}:
            continue
        try:
            value = getattr(item, prop.identifier)
            if prop.is_array:
                value = plain_setting(value)
            if isinstance(value, (bool, int, float, str, list, set, frozenset)):
                result[prop.identifier] = plain_setting(value)
        except Exception:
            pass
    return result


def constraints_info(owner):
    result = []
    for constraint in getattr(owner, "constraints", ()):
        row = {"name": constraint.name, "type": constraint.type,
               "settings": simple_settings(constraint)}
        for field in ("target", "pole_target", "space_object"):
            target = getattr(constraint, field, None)
            if target is not None:
                row[field] = target.name
        if hasattr(constraint, "inverse_matrix"):
            row["inverse_matrix"] = matrix_rows(constraint.inverse_matrix)
        if hasattr(constraint, "targets"):
            row["targets"] = [
                {"target": t.target.name if t.target else None,
                 "subtarget": t.subtarget, "weight": float(t.weight)}
                for t in constraint.targets
            ]
        result.append(row)
    return result


def empty_weight_stat():
    return {"vertex_count": 0, "weight_sum": 0.0, "max_weight": 0.0,
            "weighted_position_sum": [0.0, 0.0, 0.0],
            "min": None, "max": None}


def add_weight_stat(stat, position, weight):
    stat["vertex_count"] += 1
    stat["weight_sum"] += weight
    stat["max_weight"] = max(stat["max_weight"], weight)
    for axis in range(3):
        stat["weighted_position_sum"][axis] += position[axis] * weight
    if stat["min"] is None:
        stat["min"] = list(position)
        stat["max"] = list(position)
    else:
        for axis in range(3):
            stat["min"][axis] = min(stat["min"][axis], position[axis])
            stat["max"][axis] = max(stat["max"][axis], position[axis])


def finished_weight_stat(stat):
    result = dict(stat)
    sums = result.pop("weighted_position_sum")
    total = result["weight_sum"]
    result["centroid_armature_space"] = [x / total for x in sums] if total else None
    result["bounds_armature_space"] = {"min": result.pop("min"),
                                      "max": result.pop("max")}
    return result


def find_armature():
    active = bpy.context.view_layer.objects.active
    if active and active.type == "ARMATURE":
        return active
    if active and active.type == "MESH":
        targets = {m.object for m in active.modifiers
                   if m.type == "ARMATURE" and m.object is not None}
        if len(targets) == 1:
            return targets.pop()
    candidates = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    if len(candidates) == 1:
        return candidates[0]
    raise RuntimeError("Select the imported ARMATURE in Object Mode, then run again.")


def driver_info(owner):
    data = getattr(owner, "animation_data", None)
    if not data:
        return []
    result = []
    for curve in data.drivers:
        driver = curve.driver
        variables = []
        for variable in driver.variables:
            targets = []
            for target in variable.targets:
                targets.append({
                    "id_name": target.id.name if target.id else None,
                    "data_path": target.data_path,
                    "bone_target": getattr(target, "bone_target", ""),
                    "transform_type": getattr(target, "transform_type", ""),
                    "transform_space": getattr(target, "transform_space", ""),
                })
            variables.append({"name": variable.name, "type": variable.type,
                              "targets": targets})
        result.append({"data_path": curve.data_path,
                       "array_index": curve.array_index, "type": driver.type,
                       "expression": driver.expression, "variables": variables})
    return result


def action_curves(action):
    """Supports both legacy Actions and Blender 4.4+ layered Actions."""
    if getattr(action, "is_action_layered", False):
        for layer in action.layers:
            for strip in layer.strips:
                for bag in getattr(strip, "channelbags", ()):
                    for curve in bag.fcurves:
                        yield {"layer": layer.name,
                               "slot_handle": bag.slot_handle}, curve
    else:
        for curve in getattr(action, "fcurves", ()):
            yield {}, curve


def summarize_action(action, warnings):
    curves = []
    try:
        for context, curve in action_curves(action):
            points = curve.keyframe_points
            row = {**context, "data_path": curve.data_path,
                   "array_index": curve.array_index,
                   "mute": curve.mute, "keyframe_count": len(points),
                   "sampled_point_count": len(curve.sampled_points),
                   "modifier_types": [m.type for m in curve.modifiers]}
            if points:
                values = [float(p.co[1]) for p in points]
                row["key_value_range"] = [min(values), max(values)]
                row["key_frame_range"] = [float(points[0].co[0]),
                                          float(points[-1].co[0])]
                row["interpolation_types"] = sorted({p.interpolation for p in points})
            curves.append(row)
    except Exception as error:
        warnings.append(f"Could not inspect all curves in {action.name}: {error}")
    return {"name": action.name, "frame_range": vector_values(action.frame_range),
            "is_layered": bool(getattr(action, "is_action_layered", False)),
            "slots": [{"identifier": s.identifier, "handle": s.handle}
                      for s in getattr(action, "slots", ())], "curves": curves}


def animation_info(owner, actions):
    data = getattr(owner, "animation_data", None)
    if not data:
        return None

    def remember(action):
        if action:
            actions[action.name] = action
            return action.name
        return None

    def strip_info(strip):
        return {"name": strip.name, "type": strip.type,
                "settings": simple_settings(strip),
                "action": remember(getattr(strip, "action", None)),
                "action_slot_handle": getattr(strip, "action_slot_handle", None),
                "children": [strip_info(s) for s in getattr(strip, "strips", ())]}

    return {"action": remember(data.action),
            "action_slot_handle": getattr(data, "action_slot_handle", None),
            "settings": simple_settings(data),
            "nla_tracks": [{"name": t.name, "mute": t.mute,
                            "is_solo": t.is_solo,
                            "strips": [strip_info(s) for s in t.strips]}
                           for t in data.nla_tracks],
            "drivers": driver_info(owner)}


def mesh_info(obj, armature, aggregate):
    mesh = obj.data
    transform = armature.matrix_world.inverted() @ obj.matrix_world
    groups = {g.index: g.name for g in obj.vertex_groups}
    bones = {b.name: b for b in armature.data.bones}
    stats = {name: empty_weight_stat() for name in bones}
    raw_positions, raw_weights = [], []
    unweighted_deform, weight_sum_off = [], []
    influence_histogram = {}
    below_epsilon = 0
    deform_weight_min = None
    deform_weight_max = None
    for vertex in mesh.vertices:
        position = vector_values(transform @ vertex.co)
        weights = [[a.group, float(a.weight)] for a in vertex.groups]
        if INCLUDE_GEOMETRY:
            raw_positions.append(vector_values(vertex.co))
            raw_weights.append(weights)
        deform_sum = 0.0
        influence_count = 0
        for index, weight in weights:
            name = groups.get(index)
            if name not in bones:
                continue
            if weight <= WEIGHT_EPSILON:
                if weight > 0:
                    below_epsilon += 1
                continue
            add_weight_stat(stats[name], position, weight)
            add_weight_stat(aggregate[name], position, weight)
            if bones[name].use_deform:
                deform_sum += weight
                influence_count += 1
        influence_histogram[influence_count] = influence_histogram.get(influence_count, 0) + 1
        deform_weight_min = deform_sum if deform_weight_min is None else min(deform_weight_min, deform_sum)
        deform_weight_max = deform_sum if deform_weight_max is None else max(deform_weight_max, deform_sum)
        if not influence_count:
            unweighted_deform.append(vertex.index)
        elif abs(deform_sum - 1.0) > 1e-4:
            weight_sum_off.append(vertex.index)
    modifiers = []
    for modifier in obj.modifiers:
        row = {"name": modifier.name, "type": modifier.type,
               "show_viewport": modifier.show_viewport,
               "show_render": modifier.show_render,
               "settings": simple_settings(modifier)}
        target = getattr(modifier, "object", None)
        if target is not None:
            row["object"] = target.name
        modifiers.append(row)
    result = {
        "object": obj.name, "mesh_datablock": mesh.name,
        "mesh_datablock_users": mesh.users,
        "matrix_world": matrix_rows(obj.matrix_world),
        "mesh_to_armature_matrix": matrix_rows(transform),
        "parent": obj.parent.name if obj.parent else None,
        "parent_type": obj.parent_type, "parent_bone": obj.parent_bone,
        "vertex_count": len(mesh.vertices), "edge_count": len(mesh.edges),
        "polygon_count": len(mesh.polygons),
        "vertex_groups": [{"index": g.index, "name": g.name,
                           "lock_weight": g.lock_weight,
                           "matches_bone": g.name in bones}
                          for g in obj.vertex_groups],
        "bone_weight_stats": {name: finished_weight_stat(stat)
                              for name, stat in stats.items() if stat["vertex_count"]},
        "deform_influences_per_vertex": influence_histogram,
        "deform_weight_sum_range": [deform_weight_min, deform_weight_max],
        "vertices_without_deform_group_weights": unweighted_deform,
        "vertices_with_deform_weight_sum_not_one": weight_sum_off,
        "positive_bone_weights_below_epsilon": below_epsilon,
        "modifiers": modifiers, "constraints": constraints_info(obj),
        "shape_keys": [{"name": k.name, "value": k.value,
                        "relative_key": k.relative_key.name if k.relative_key else None}
                       for k in mesh.shape_keys.key_blocks] if mesh.shape_keys else [],
    }
    if INCLUDE_GEOMETRY:
        result["geometry"] = {
            "coordinate_space": "mesh local; original Mesh datablock, before modifiers",
            "vertices": raw_positions,
            "edges": [list(e.vertices) for e in mesh.edges],
            "polygons": [list(p.vertices) for p in mesh.polygons],
            "weights_per_vertex": raw_weights,
        }
    return result


def timeline_samples(armature, warnings):
    data = armature.animation_data
    has_animation = data and (
        data.action is not None or len(data.drivers) > 0 or
        (data.use_nla and any(not t.mute and len(t.strips) for t in data.nla_tracks))
    )
    if not SAMPLE_CURRENT_TIMELINE or not has_animation:
        return {"samples": [], "reason": "Disabled, or rig has no assigned action, NLA, or drivers."}
    scene = bpy.context.scene
    old_frame, old_subframe = scene.frame_current, scene.frame_subframe
    start, end = scene.frame_start, scene.frame_end
    count = min(max(2, MAX_TIMELINE_SAMPLES), max(1, end - start + 1))
    frames = sorted({round(start + i * (end - start) / max(1, count - 1))
                     for i in range(count)})
    samples = []
    try:
        for frame in frames:
            scene.frame_set(frame)
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated = armature.evaluated_get(depsgraph)
            samples.append({"frame": frame,
                            "armature_matrix_world": matrix_rows(evaluated.matrix_world),
                            "pose_matrices_armature_space": {
                                b.name: matrix_rows(b.matrix) for b in evaluated.pose.bones}})
    except Exception as error:
        warnings.append(f"Timeline sampling stopped early: {error}")
    finally:
        scene.frame_set(old_frame, subframe=old_subframe)
    return {"scope": "Current action/NLA/constraints/drivers evaluated together; no action switching",
            "requested_frame_range": [start, end], "samples": samples,
            "note": "Sparse samples are diagnostic evidence, not proof that a merge preserves all motion."}


def external_references(armature):
    result = []
    for obj in bpy.data.objects:
        if obj.parent == armature:
            result.append({"object": obj.name, "kind": "parent",
                           "object_type": obj.type,
                           "parent_type": obj.parent_type, "bone": obj.parent_bone,
                           "matrix_world": matrix_rows(obj.matrix_world),
                           "matrix_parent_inverse": matrix_rows(obj.matrix_parent_inverse)})
        owners = [(obj.name, obj)]
        if obj.type == "ARMATURE":
            owners.extend((f"{obj.name}/{bone.name}", bone) for bone in obj.pose.bones)
        for label, owner in owners:
            for constraint in constraints_info(owner):
                target_names = [constraint.get(k) for k in ("target", "pole_target", "space_object")]
                target_names.extend(t["target"] for t in constraint.get("targets", []))
                if armature.name in target_names:
                    result.append({"owner": label, "kind": "constraint", "constraint": constraint})
        driver_owners = [obj, obj.data]
        if obj.type == "MESH" and obj.data.shape_keys:
            driver_owners.append(obj.data.shape_keys)
        for owner in driver_owners:
            if owner is None:
                continue
            for driver in driver_info(owner):
                if any(t["id_name"] in {armature.name, armature.data.name}
                       for v in driver["variables"] for t in v["targets"]):
                    result.append({"owner": owner.name, "kind": "driver", "driver": driver})
    return result


def collect_report():
    if bpy.context.mode != "OBJECT":
        raise RuntimeError("Switch to Object Mode before running the dump. Nothing was changed.")
    armature = find_armature()
    warnings = []
    bound = sorted([o for o in bpy.data.objects if o.type == "MESH" and
                    any(m.type == "ARMATURE" and m.object == armature for m in o.modifiers)],
                   key=lambda o: o.name)
    if not bound:
        warnings.append("No mesh has an Armature modifier targeting this armature.")
    actions = {}
    aggregate = {b.name: empty_weight_stat() for b in armature.data.bones}
    meshes = [mesh_info(obj, armature, aggregate) for obj in bound]
    for obj, info in zip(bound, meshes):
        info["animation"] = animation_info(obj, actions)
        if obj.data.shape_keys:
            info["shape_key_animation"] = animation_info(obj.data.shape_keys, actions)
        arm_modifiers = [m for m in obj.modifiers if m.type == "ARMATURE"]
        if len(arm_modifiers) > 1:
            warnings.append(f"{obj.name} has multiple Armature modifiers; weights may serve multiple rigs.")
        for modifier in arm_modifiers:
            if modifier.object == armature and modifier.use_bone_envelopes:
                warnings.append(f"{obj.name} uses bone envelopes; group statistics do not describe all deformation.")
            if modifier.object == armature and not modifier.use_vertex_groups:
                warnings.append(f"{obj.name}: vertex-group deformation is disabled in {modifier.name}.")
    bones = []
    for bone in armature.data.bones:
        pose = armature.pose.bones[bone.name]
        bones.append({
            "name": bone.name, "parent": bone.parent.name if bone.parent else None,
            "children": [b.name for b in bone.children],
            "head_armature_space": vector_values(bone.head_local),
            "tail_armature_space": vector_values(bone.tail_local),
            "rest_matrix_armature_space": matrix_rows(bone.matrix_local),
            "pose_matrix_armature_space_at_original_frame": matrix_rows(pose.matrix),
            "pose_matrix_basis_at_original_frame": matrix_rows(pose.matrix_basis),
            "settings": simple_settings(bone),
            "rotation_mode": pose.rotation_mode,
            "constraints": constraints_info(pose),
            "collections": [c.name for c in getattr(bone, "collections", ())],
            "weight_stats": finished_weight_stat(aggregate[bone.name]),
        })
    bone_names = {b.name for b in armature.data.bones}
    pairs = [{"root": b.name, "leaf": "bone_" + b.name[5:],
              "leaf_is_child": armature.data.bones["bone_" + b.name[5:]].parent == b}
             for b in armature.data.bones
             if re.fullmatch(r"root_\d+", b.name) and "bone_" + b.name[5:] in bone_names]
    rig_animation = animation_info(armature, actions)
    rig_data_animation = animation_info(armature.data, actions)
    report = {
        "schema_version": SCHEMA_VERSION,
        "script_version": SCRIPT_VERSION,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "blender_version": bpy.app.version_string,
        "scope": "One selected armature and all mesh objects in the .blend whose modifiers target it",
        "geometry_included": INCLUDE_GEOMETRY, "weight_epsilon": WEIGHT_EPSILON,
        "scene": {"frame_current": bpy.context.scene.frame_current,
                  "frame_subframe": bpy.context.scene.frame_subframe,
                  "frame_start": bpy.context.scene.frame_start,
                  "frame_end": bpy.context.scene.frame_end,
                  "fps": bpy.context.scene.render.fps,
                  "fps_base": bpy.context.scene.render.fps_base,
                  "unit_system": bpy.context.scene.unit_settings.system,
                  "unit_scale": bpy.context.scene.unit_settings.scale_length},
        "armature": {"object": armature.name, "datablock": armature.data.name,
                     "matrix_world": matrix_rows(armature.matrix_world),
                     "pose_position": armature.data.pose_position,
                     "parent": armature.parent.name if armature.parent else None,
                     "constraints": constraints_info(armature),
                     "animation": rig_animation,
                     "datablock_animation": rig_data_animation, "bones": bones},
        "meshes": meshes, "runeapps_numbered_pair_candidates": pairs,
        "external_references": external_references(armature),
        "assigned_actions": [summarize_action(a, warnings) for a in actions.values()],
        "other_action_names": sorted(a.name for a in bpy.data.actions if a.name not in actions),
        "timeline": timeline_samples(armature, warnings), "warnings": warnings,
    }
    return report


def summary_text(report):
    bones = report["armature"]["bones"]
    meshes = report["meshes"]
    weighted = [b for b in bones if b["weight_stats"]["vertex_count"]]
    unweighted = [b["name"] for b in bones if not b["weight_stats"]["vertex_count"]]
    lines = ["Rune rig diagnostics", "====================", "",
             f"Blender: {report['blender_version']}",
             f"Armature: {report['armature']['object']}",
             f"Bones: {len(bones)}; with group weights above epsilon: {len(weighted)}",
             f"Root bones: {sum(b['parent'] is None for b in bones)}",
             f"Numbered root_i / bone_i candidates: {len(report['runeapps_numbered_pair_candidates'])}",
             f"Bound mesh objects: {len(meshes)}",
             f"Raw mesh vertices: {sum(m['vertex_count'] for m in meshes)}",
             f"Geometry included: {report['geometry_included']}",
             f"Assigned actions inspected: {len(report['assigned_actions'])}",
             f"Current timeline samples: {len(report['timeline']['samples'])}", "",
             "MESH OBJECTS"]
    for mesh in meshes:
        lines.append(f"  {mesh['object']}: {mesh['vertex_count']} vertices; "
                     f"{len(mesh['bone_weight_stats'])} weighted bone groups; "
                     f"{len(mesh['vertices_without_deform_group_weights'])} vertices without deform-group weights")
    lines += ["", "BONES WITHOUT GROUP WEIGHTS ABOVE EPSILON", "; ".join(unweighted) or "None",
              "", "These are NOT a deletion list. Parents, constraints, envelopes, attachments,",
              "and animations can make unweighted bones essential.", "",
              "ASSIGNED ACTIONS"]
    for action in report["assigned_actions"]:
        lines.append(f"  {action['name']}: range {action['frame_range']}, "
                     f"{len(action['curves'])} inspected curves")
    lines += ["", "WARNINGS"] + (report["warnings"] or ["None detected by this diagnostic."])
    lines += ["", "NOTES", "Geometry is original mesh data before modifiers, not evaluated posed geometry.",
              "Action data contains curve summaries; it is not a full animation export.",
              "Timeline samples evaluate the currently assigned animation setup only.",
              "No bones, weights, modifiers, actions, or saved .blend files were changed.",
              "Object/data-block names and raw model geometry are included; textures are not."]
    return "\n".join(lines) + "\n"


def output_directory():
    if OUTPUT_DIRECTORY:
        directory = Path(bpy.path.abspath(OUTPUT_DIRECTORY)).expanduser()
    elif bpy.data.filepath:
        directory = Path(bpy.data.filepath).parent / "rune_rig_diagnostics"
    else:
        directory = Path(tempfile.gettempdir()) / "rune_rig_diagnostics"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def main():
    print("Rune rig dump: reading the rig and bound meshes...")
    report = collect_report()
    # Validate the complete report before creating any archive. Streaming avoids
    # allocating a second full JSON string for large mesh dumps.
    encoder = json.JSONEncoder(separators=(",", ":"), allow_nan=False,
                               default=json_default)
    for chunk in encoder.iterencode(report):
        pass
    summary = summary_text(report)
    directory = output_directory()
    safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", report["armature"]["object"])[:70] or "rig"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    stem = f"{safe_name}_{stamp}_{uuid.uuid4().hex[:6]}"
    archive_path = directory / f"{stem}.zip"
    summary_path = directory / f"{stem}_summary.txt"
    with zipfile.ZipFile(archive_path, "x", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        archive.writestr("summary.txt", summary)
        with archive.open("rig_report.json", "w") as binary:
            with io.TextIOWrapper(binary, encoding="utf-8") as text_stream:
                json.dump(report, text_stream, separators=(",", ":"), allow_nan=False,
                          default=json_default)
    with summary_path.open("x", encoding="utf-8") as stream:
        stream.write(summary)
    print(summary)
    print(f"UPLOAD THIS ZIP: {archive_path}")
    print(f"Readable summary: {summary_path}")
    try:
        def draw_popup(self, context):
            self.layout.label(text="Rig diagnostics saved. Upload the ZIP from:")
            self.layout.label(text=str(directory))
            self.layout.label(text=archive_path.name)
        bpy.context.window_manager.popup_menu(draw_popup, title="Rune rig dump complete", icon="INFO")
    except Exception:
        pass


if __name__ == "__main__":
    main()
