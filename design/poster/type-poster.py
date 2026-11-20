"""Demo poster: pwndbg/color/syntax_highlight.py lines 87-94 at the head commit, set as metal
type with each line's git blame date beside it. The stale comment (line 88, 2018) sits on an amber
highlight strip and has slid out of line, like the second stroke of the mark; the code below it changed
in 2022 (its date in black; older dates are grey).

Run on the Mac (Metal GPU):
  Blender -b --python design/poster/type-poster.py -- FONT.ttf OUT.png [samples] [scale%]
"""

import math
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
FONT, OUT = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 256
SCALE = int(argv[3]) if len(argv) > 3 else 100

# lib/landing/drift.json, states[2]: (line, blame date, text)
LINES = [
    (87, "2024-01-02", 'def syntax_highlight(code: str, filename: str = ".asm") -> str:'),
    (88, "2018-01-12", "    # No syntax highlight if pygment is not installed"),
    (89, "2022-10-08", "    if disable_colors:"),
    (90, "2018-01-12", "        return code"),
    (91, "2018-01-12", ""),
    (92, "2018-01-12", "    filename = os.path.basename(filename)"),
    (93, "2018-01-12", ""),
    (94, "2026-05-28", "    lexer = lexer_cache.get(filename)"),
]
COMMENT, CHANGED = 88, 89
LEAD = 1.55
CODE_X = 7.4
DATE_X = CODE_X - 6.9


def linear(hex_color):
    def channel(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(channel(int(hex_color[i:i + 2], 16)) for i in (1, 3, 5)) + (1.0,)


def material(name, hex_color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = linear(hex_color)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
font = bpy.data.fonts.load(FONT)

# The logo on the site's ground: black type, amber for the stale comment, grey for old dates.
ink = material("ink", "#111317", 0.2, 0.35)
muted = material("muted", "#8e959e", 0.1, 0.5)
amber = material("amber", "#f2b705", 0.05, 0.35)
ground = material("ground", "#fbfbfc", 0.0, 0.6)


def slug(body, x, y, mat, depth, rot=0.0):
    curve = bpy.data.curves.new(f"t{len(bpy.data.curves)}", type="FONT")
    curve.body = body
    curve.font = font
    curve.size = 1.0
    curve.extrude = depth
    curve.bevel_depth = 0.006
    curve.bevel_resolution = 2
    obj = bpy.data.objects.new(curve.name, curve)
    obj.location = (x, y, depth)
    obj.rotation_euler = (0, 0, rot)
    obj.data.materials.append(mat)
    scene.collection.objects.link(obj)
    return obj


def highlight(obj, depth):
    """The site's amber highlight as a strip under the type, carried with it."""
    bpy.context.view_layer.update()
    xs = [corner[0] for corner in obj.bound_box]
    ys = [corner[1] for corner in obj.bound_box]
    bpy.ops.mesh.primitive_cube_add(size=1)
    strip = bpy.context.object
    strip.scale = (max(xs) - min(xs) + 0.5, max(ys) - min(ys) + 0.45, 0.08)
    strip.parent = obj
    strip.location = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, -depth - 0.04)
    strip.data.materials.append(amber)


for index, (n, date, text) in enumerate(LINES):
    y = -index * LEAD
    if n == COMMENT:
        # Out of step: a character right, a fifth of a line down, turned and lifted off the bed.
        for body, x in ((date, DATE_X), (text, CODE_X)):
            obj = slug(body, x + 0.6, y - 0.3, ink, 0.03, math.radians(-2.2))
            obj.location.z += 0.3
            highlight(obj, 0.03)
        continue
    slug(date, DATE_X, y, ink if n == CHANGED else muted, 0.025)
    if text:
        slug(text, CODE_X, y, ink, 0.03)

bpy.ops.mesh.primitive_plane_add(size=400, location=(20, -6, 0))
bpy.context.object.data.materials.append(ground)

world = bpy.data.worlds.new("world")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = linear("#fbfbfc")
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
scene.world = world


def area(name, location, target, size, energy, hex_color="#ffffff"):
    light = bpy.data.lights.new(name, type="AREA")
    light.size = size
    light.energy = energy
    light.color = linear(hex_color)[:3]
    obj = bpy.data.objects.new(name, light)
    obj.location = location
    scene.collection.objects.link(obj)
    aim = obj.constraints.new("TRACK_TO")
    aim.target = target
    obj.visible_camera = False
    return obj


focus = bpy.data.objects.new("focus", None)
focus.location = (CODE_X + 5, -LEAD - 0.3, 0.3)
scene.collection.objects.link(focus)

area("key", (-14, 14, 16), focus, 18, 7000, "#ffffff")
area("front", (CODE_X + 6, -LEAD - 26, 26), focus, 22, 3500, "#ffffff")

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 50
cam_data.dof.use_dof = True
cam_data.dof.focus_object = focus
cam_data.dof.aperture_fstop = 5.6
cam_data.shift_y = 0.07
cam = bpy.data.objects.new("cam", cam_data)
cam.location = (CODE_X - 1, -LEAD - 22, 38)
scene.collection.objects.link(cam)
cam.constraints.new("TRACK_TO").target = focus
scene.camera = cam

prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for device in prefs.devices:
    device.use = True
scene.render.engine = "CYCLES"
scene.cycles.device = "GPU"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = SCALE
scene.view_settings.view_transform = "Standard"  # keeps the brand amber unshifted
scene.view_settings.exposure = 0.25
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
