"""Rune Rig converter: reviewed Moia profile, named humanoid rigs, guided reconstruction.

Run this in Blender's Text Editor with the ORIGINAL imported armature selected.
Creates independent mesh/armature copies in a new collection. The source stays
intact and is hidden in the viewport/render only after successful validation.
The result is a named FK authoring rig; it does not include IK or retarget clips.
"""

import json
import math
import hashlib
import struct

# True: 70 bones, including three joints per finger. False: 40 bones, rigid hands.
KEEP_FINGERS = True
# Shift the new character beside the source for comparison, in Blender units.
# Zero leaves it in the source location; the source is hidden after success.
OUTPUT_OFFSET = (0.0, 0.0, 0.0)
HIDE_SOURCE_AFTER_SUCCESS = True
CREATE_JAW_OPEN_SHAPE = True
JAW_OPEN_DEGREES = 20.0
# Configure a detected Saturday06 VRM add-on using its VRM 0.x property API.
# Metadata/license fields still need your own choices before exporting.
CONFIGURE_VRM0 = True
PRESET_VERSION = "moia-1.2"
# Mesh cleanup is allowed by default. Skeleton and current weights are checked
# separately; an ordered mesh fingerprint is diagnostic, not character identity.
STRICT_MESH_REFERENCE = False
NORMALIZE_SOURCE_WEIGHTS = True


# AUTO: Moia layout, recognized humanoid names/VRM roles, then guided workflow.
# GUIDED: force the landmark workflow, including for a recognized skeleton.
CONVERSION_MODE = "AUTO"
# Optional role overrides for a chained source rig; keys use VRM0 role names.
# Example: {"hips": "bone_1", "head": "bone_112", ...}
HUMANOID_ROLE_BONES = {}
# For guided fitting, run once to create markers, position them, then set True.
# This explicit switch prevents treating an unreviewed template as fitted joints.
GUIDED_LANDMARKS_READY = False
# Approximate template orientation in WORLD space; set for unfamiliar imports.
# Bill's inspected import uses up +Z and forward -Y. Templates are only seeds.
GUIDED_UP = (0, 0, 1)
GUIDED_FORWARD = (0, -1, 0)
# Rotate mesh and joints together to Blender +Y forward/+Z up for VRM 0.x.
# Disable if you want the generic result in the original world orientation.
CANONICALIZE_FOR_VRM0 = True
# AUTO can reuse a successfully fitted profile from this .blend's Text blocks.
# For another .blend, paste the profile Text's JSON between these triple quotes.
GUIDED_PROFILE_JSON = """"""
REUSE_GUIDED_PROFILES = True
# Optional whole-source-region assignments for guided reconstruction only.
# Example AFTER checking the region: {"bone_180": "head"} for a beard.
# RR:<target> vertex groups take precedence. Unmapped skin uses geometry.
GUIDED_SOURCE_REGION_TARGETS = {}
GENERIC_PLAN = None
UNIVERSAL_VERSION = "rune-rig-0.4"



EXPECTED_SOURCE = json.loads(r'''{"parents":{"bone_0":null,"bone_1":"bone_0","bone_2":"bone_1","bone_3":"bone_2","bone_4":"bone_3","bone_5":"bone_4","bone_6":"bone_5","bone_7":"bone_6","bone_8":"bone_7","bone_9":"bone_1","bone_10":"bone_1","bone_11":"bone_10","bone_12":"bone_11","bone_13":"bone_12","bone_14":"bone_13","bone_15":"bone_1","bone_16":"bone_15","bone_17":"bone_15","bone_18":"bone_17","bone_19":"bone_18","bone_20":"bone_19","bone_21":"bone_20","bone_22":"bone_21","bone_23":"bone_15","bone_24":"bone_23","bone_25":"bone_24","bone_26":"bone_25","bone_27":"bone_26","bone_28":"bone_27","bone_29":"bone_1","bone_30":"bone_1","bone_31":"bone_30","bone_32":"bone_31","bone_33":"bone_32","bone_34":"bone_33","bone_35":"bone_1","bone_36":"bone_35","bone_37":"bone_35","bone_38":"bone_37","bone_39":"bone_38","bone_40":"bone_39","bone_41":"bone_40","bone_42":"bone_41","bone_43":"bone_35","bone_44":"bone_43","bone_45":"bone_44","bone_46":"bone_45","bone_47":"bone_46","bone_48":"bone_47","bone_49":"bone_1","bone_50":"bone_49","bone_51":"bone_50","bone_52":"bone_51","bone_53":"bone_52","bone_54":"bone_53","bone_55":"bone_54","bone_56":"bone_1","bone_57":"bone_56","bone_58":"bone_57","bone_59":"bone_58","bone_60":"bone_59","bone_61":"bone_59","bone_62":"bone_61","bone_63":"bone_62","bone_64":"bone_63","bone_65":"bone_64","bone_66":"bone_65","bone_67":"bone_66","bone_68":"bone_67","bone_69":"bone_68","bone_70":"bone_69","bone_71":"bone_70","bone_72":"bone_71","bone_73":"bone_72","bone_74":"bone_73","bone_75":"bone_74","bone_76":"bone_61","bone_77":"bone_61","bone_78":"bone_59","bone_79":"bone_59","bone_80":"bone_79","bone_81":"bone_80","bone_82":"bone_81","bone_83":"bone_81","bone_84":"bone_83","bone_85":"bone_84","bone_86":"bone_85","bone_87":"bone_86","bone_88":"bone_87","bone_89":"bone_83","bone_90":"bone_89","bone_91":"bone_90","bone_92":"bone_91","bone_93":"bone_92","bone_94":"bone_83","bone_95":"bone_94","bone_96":"bone_95","bone_97":"bone_96","bone_98":"bone_97","bone_99":"bone_83","bone_100":"bone_99","bone_101":"bone_100","bone_102":"bone_101","bone_103":"bone_102","bone_104":"bone_83","bone_105":"bone_83","bone_106":"bone_105","bone_107":"bone_106","bone_108":"bone_107","bone_109":"bone_59","bone_110":"bone_59","bone_111":"bone_59","bone_112":"bone_111","bone_113":"bone_112","bone_114":"bone_113","bone_115":"bone_114","bone_116":"bone_114","bone_117":"bone_114","bone_118":"bone_114","bone_119":"bone_114","bone_120":"bone_119","bone_121":"bone_120","bone_122":"bone_121","bone_123":"bone_112","bone_124":"bone_123","bone_125":"bone_123","bone_126":"bone_125","bone_127":"bone_126","bone_128":"bone_127","bone_129":"bone_128","bone_130":"bone_129","bone_131":"bone_130","bone_132":"bone_123","bone_133":"bone_123","bone_134":"bone_123","bone_135":"bone_123","bone_136":"bone_123","bone_137":"bone_136","bone_138":"bone_136","bone_139":"bone_136","bone_140":"bone_123","bone_141":"bone_123","bone_142":"bone_123","bone_143":"bone_123","bone_144":"bone_143","bone_145":"bone_143","bone_146":"bone_143","bone_147":"bone_123","bone_148":"bone_147","bone_149":"bone_147","bone_150":"bone_123","bone_151":"bone_123","bone_152":"bone_123","bone_153":"bone_123","bone_154":"bone_153","bone_155":"bone_153","bone_156":"bone_153","bone_157":"bone_123","bone_158":"bone_123","bone_159":"bone_123","bone_160":"bone_123","bone_161":"bone_59","bone_162":"bone_161","bone_163":"bone_162","bone_164":"bone_163","bone_165":"bone_163","bone_166":"bone_165","bone_167":"bone_166","bone_168":"bone_167","bone_169":"bone_168","bone_170":"bone_169","bone_171":"bone_165","bone_172":"bone_171","bone_173":"bone_172","bone_174":"bone_173","bone_175":"bone_174","bone_176":"bone_165","bone_177":"bone_176","bone_178":"bone_177","bone_179":"bone_178","bone_180":"bone_179","bone_181":"bone_165","bone_182":"bone_181","bone_183":"bone_182","bone_184":"bone_183","bone_185":"bone_184","bone_186":"bone_165","bone_187":"bone_165","bone_188":"bone_187","bone_189":"bone_188","bone_190":"bone_189","bone_191":"bone_59","bone_192":"bone_59"},"heads":{"bone_0":[0.0,0.0,0.0],"bone_1":[0.0,1.5182268725766335e-05,-443.5557861328125],"bone_2":[-2.501372136975988e-06,-54.87547302246094,-464.538818359375],"bone_3":[3.269074795753113e-06,-57.810611724853516,-416.1328125],"bone_4":[1.0254811968479771e-05,-61.3639030456543,-357.5321960449219],"bone_5":[1.7240548913832754e-05,-64.91720581054688,-298.93157958984375],"bone_6":[2.4226290406659245e-05,-68.47050476074219,-240.3309326171875],"bone_7":[3.121203189948574e-05,-72.0238037109375,-181.7303009033203],"bone_8":[3.819777339231223e-05,-75.57710266113281,-123.12964630126953],"bone_9":[-93.10807037353516,17.16948890686035,-380.0304260253906],"bone_10":[-43.79799270629883,-1.605612874031067,-421.0797119140625],"bone_11":[-45.30362319946289,-2.411945104598999,-214.51145935058594],"bone_12":[-46.42033004760742,12.386560440063477,-53.28578186035156],"bone_13":[-48.226654052734375,-53.994449615478516,-0.0001439598563592881],"bone_14":[-49.83229064941406,-87.55609130859375,-0.10414476692676544],"bone_15":[-62.31117248535156,-5.38596773147583,-470.41473388671875],"bone_16":[-94.1673355102539,-8.061291694641113,-419.3635559082031],"bone_17":[-53.136138916015625,-44.203948974609375,-466.9844055175781],"bone_18":[-65.65288543701172,-43.00067901611328,-402.6705017089844],"bone_19":[-78.34293365478516,-41.68798828125,-338.39300537109375],"bone_20":[-90.68641662597656,-40.594146728515625,-274.0426025390625],"bone_21":[-103.20317840576172,-39.3908805847168,-209.72865295410156],"bone_22":[-115.7199478149414,-38.187618255615234,-145.41470336914062],"bone_23":[-42.9389533996582,30.523969650268555,-468.46075439453125],"bone_24":[-46.391395568847656,39.71121597290039,-403.8553466796875],"bone_25":[-49.68181610107422,48.8314094543457,-339.06158447265625],"bone_26":[-52.81023025512695,57.88456726074219,-274.079345703125],"bone_27":[-57.056758880615234,67.4003677368164,-210.39768981933594],"bone_28":[-60.586212158203125,76.61946868896484,-145.88189697265625],"bone_29":[93.10808563232422,17.169466018676758,-380.0304260253906],"bone_30":[43.79800033569336,-1.6056214570999146,-421.0797119140625],"bone_31":[45.30367660522461,-2.411952018737793,-214.5113983154297],"bone_32":[46.4204216003418,12.386550903320312,-53.285675048828125],"bone_33":[48.22675704956055,-53.99446105957031,-2.237970329588279e-05],"bone_34":[49.832393646240234,-87.55610656738281,-0.10402346402406693],"bone_35":[62.31116485595703,-5.385982513427734,-470.41473388671875],"bone_36":[94.16734313964844,-8.061308860778809,-419.3635559082031],"bone_37":[53.13613510131836,-44.20396423339844,-466.98443603515625],"bone_38":[65.65290832519531,-43.00068664550781,-402.6705322265625],"bone_39":[78.34297943115234,-41.68799591064453,-338.39306640625],"bone_40":[90.68649291992188,-40.594154357910156,-274.0426940917969],"bone_41":[103.20327758789062,-39.3908805847168,-209.72872924804688],"bone_42":[115.7200698852539,-38.1876106262207,-145.41477966308594],"bone_43":[42.93893814086914,30.523950576782227,-468.46075439453125],"bone_44":[46.39139175415039,39.71119689941406,-403.8553466796875],"bone_45":[49.681827545166016,48.83140182495117,-339.06158447265625],"bone_46":[52.81025314331055,57.88456726074219,-274.079345703125],"bone_47":[57.056793212890625,67.40037536621094,-210.39768981933594],"bone_48":[60.58626174926758,76.61947631835938,-145.88189697265625],"bone_49":[-2.7616440547717502e-06,36.47016906738281,-466.7221374511719],"bone_50":[2.113202299369732e-06,44.59954833984375,-425.8289794921875],"bone_51":[7.378079772024648e-06,53.37934112548828,-381.66400146484375],"bone_52":[1.2466420230339281e-05,61.86473846435547,-338.97991943359375],"bone_53":[1.7134612789959647e-05,69.64948272705078,-299.8202819824219],"bone_54":[2.185360608564224e-05,77.51895141601562,-260.2344970703125],"bone_55":[3.0226017770473845e-05,91.48091888427734,-190.0016326904297],"bone_56":[-4.820437879970996e-06,-1.350165843963623,-483.9925537109375],"bone_57":[-9.622009201848414e-06,-1.939820647239685,-524.2710571289062],"bone_58":[-1.436357524653431e-05,-1.439146876335144,-564.0462036132812],"bone_59":[-2.3845637770136818e-05,13.80161190032959,-643.5875244140625],"bone_60":[29.789304733276367,125.03724670410156,-604.8320922851562],"bone_61":[-2.4761775421211496e-05,39.29813766479492,-651.2726440429688],"bone_62":[-1.913445521495305e-05,47.252967834472656,-604.0672607421875],"bone_63":[-1.3507131370715797e-05,55.20781326293945,-556.8618774414062],"bone_64":[-7.879812983446755e-06,63.16264724731445,-509.6565246582031],"bone_65":[-2.252490503451554e-06,71.11748504638672,-462.4511413574219],"bone_66":[3.37482879331219e-06,79.07231903076172,-415.24578857421875],"bone_67":[9.002148544823285e-06,87.02715301513672,-368.0404357910156],"bone_68":[1.4629469660576433e-05,94.98198699951172,-320.8350830078125],"bone_69":[2.0256788047845475e-05,102.93681335449219,-273.6297302246094],"bone_70":[2.5884110073093325e-05,110.89164733886719,-226.42434692382812],"bone_71":[3.151143027935177e-05,118.84648895263672,-179.21897888183594],"bone_72":[3.713875048561022e-05,126.80131530761719,-132.01361083984375],"bone_73":[4.276607069186866e-05,134.75613403320312,-84.80823516845703],"bone_74":[4.839339089812711e-05,142.71095275878906,-37.60285949707031],"bone_75":[5.3081108490005136e-05,149.33755493164062,1.720538854598999],"bone_76":[-45.039581298828125,43.167823791503906,-643.8722534179688],"bone_77":[45.03953552246094,43.16781234741211,-643.8722534179688],"bone_78":[-0.006689746398478746,-45.61602783203125,-625.2288208007812],"bone_79":[-10.4638671875,-5.544132232666016,-636.4673461914062],"bone_80":[-71.11299896240234,15.874857902526855,-625.2371826171875],"bone_81":[-153.84950256347656,21.14433479309082,-518.7423095703125],"bone_82":[-175.92971801757812,10.923545837402344,-475.4154052734375],"bone_83":[-198.00997924804688,0.7027506232261658,-432.0884704589844],"bone_84":[-206.22601318359375,-15.466583251953125,-423.44097900390625],"bone_85":[-220.27757263183594,-23.971820831298828,-383.7637939453125],"bone_86":[-220.43545532226562,-25.731956481933594,-364.07501220703125],"bone_87":[-217.98306274414062,-26.356836318969727,-350.05352783203125],"bone_88":[-213.9944305419922,-26.621990203857422,-335.1905212402344],"bone_89":[-208.12513732910156,-8.41978645324707,-422.4184265136719],"bone_90":[-225.70574951171875,-11.369257926940918,-381.1474609375],"bone_91":[-224.3411102294922,-12.398053169250488,-360.47515869140625],"bone_92":[-220.14976501464844,-12.254742622375488,-345.0857849121094],"bone_93":[-215.5662384033203,-11.913222312927246,-330.9476318359375],"bone_94":[-210.21490478515625,1.5745059251785278,-421.7481689453125],"bone_95":[-224.19390869140625,3.446390151977539,-380.72344970703125],"bone_96":[-223.84742736816406,3.14516019821167,-358.4616394042969],"bone_97":[-221.20204162597656,3.1072564125061035,-345.9339599609375],"bone_98":[-216.3881072998047,3.1648430824279785,-331.9456481933594],"bone_99":[-209.48280334472656,10.102882385253906,-422.0162658691406],"bone_100":[-220.0808563232422,14.265153884887695,-381.97027587890625],"bone_101":[-221.6213836669922,15.358072280883789,-365.513427734375],"bone_102":[-220.05104064941406,15.839735984802246,-355.0195617675781],"bone_103":[-216.42515563964844,16.326780319213867,-341.47198486328125],"bone_104":[-202.24977111816406,1.9426028728485107,-361.6901550292969],"bone_105":[-199.2376708984375,-12.932516098022461,-422.6506042480469],"bone_106":[-197.150634765625,-24.25432014465332,-400.4126281738281],"bone_107":[-195.63865661621094,-33.31686782836914,-381.19049072265625],"bone_108":[-194.50823974609375,-40.09235763549805,-366.8193054199219],"bone_109":[-35.15047073364258,-50.745262145996094,-588.469970703125],"bone_110":[-81.57562255859375,12.279952049255371,-682.8953247070312],"bone_111":[-2.8847873181803152e-05,10.765096664428711,-685.54931640625],"bone_112":[-3.335722431074828e-05,-1.7314345836639404,-723.3765258789062],"bone_113":[-3.240925434511155e-05,-8.238381385803223,-715.4243774414062],"bone_114":[-2.9154836738598533e-05,-49.58829879760742,-688.1243286132812],"bone_115":[-7.3591508865356445,-49.02236557006836,-699.8035888671875],"bone_116":[-3.05715439026244e-05,-52.38423156738281,-700.008544921875],"bone_117":[7.3590898513793945,-49.022369384765625,-699.8035888671875],"bone_118":[-3.05552821373567e-05,-46.00051498413086,-699.8721313476562],"bone_119":[-3.072531399084255e-05,-20.300079345703125,-701.2984619140625],"bone_120":[-3.074027699767612e-05,-27.837797164916992,-701.4240112304688],"bone_121":[-3.075523636653088e-05,-35.499393463134766,-701.5494995117188],"bone_122":[-3.077019573538564e-05,-43.9455451965332,-701.6749877929688],"bone_123":[-4.080632788827643e-05,-8.453734397888184,-785.8641357421875],"bone_124":[-3.5833611036650836e-05,-49.415138244628906,-744.1499633789062],"bone_125":[-3.3336466003675014e-05,29.63498878479004,-723.202392578125],"bone_126":[-3.208452108083293e-05,38.185264587402344,-712.7003173828125],"bone_127":[-3.0104978577583097e-05,44.65812683105469,-696.0947265625],"bone_128":[-2.8187385396449827e-05,50.928401947021484,-680.0087890625],"bone_129":[-2.6231906304019503e-05,57.32258605957031,-663.6050415039062],"bone_130":[-2.419103475403972e-05,63.99597930908203,-646.4849853515625],"bone_131":[-2.204142583650537e-05,71.02494049072266,-628.4527587890625],"bone_132":[-4.080632788827643e-05,-8.453734397888184,-785.8641357421875],"bone_133":[-16.356781005859375,-43.19793701171875,-722.8917236328125],"bone_134":[-31.01974868774414,-4.799102306365967,-718.3546752929688],"bone_135":[-14.667980194091797,-36.197303771972656,-736.5130004882812],"bone_136":[-13.1355562210083,-47.14341735839844,-753.3206176757812],"bone_137":[-7.633046627044678,-51.08755111694336,-745.2764892578125],"bone_138":[-16.10024642944336,-47.41942596435547,-746.359130859375],"bone_139":[-23.902339935302734,-42.736976623535156,-743.0189819335938],"bone_140":[-14.511991500854492,-37.42650604248047,-736.5130004882812],"bone_141":[-14.742015838623047,-37.4265022277832,-736.5130004882812],"bone_142":[-12.417306900024414,-44.8124885559082,-704.0133666992188],"bone_143":[-3.2034353353083134e-05,-53.09859085083008,-712.2794799804688],"bone_144":[-7.942964553833008,-50.34788131713867,-709.3104858398438],"bone_145":[-3.16721125273034e-05,-53.32746887207031,-709.4696655273438],"bone_146":[7.942900657653809,-50.34788513183594,-709.3104858398438],"bone_147":[-3.3095679100370035e-05,-57.23234176635742,-721.1824951171875],"bone_148":[-3.3534445762634277,-56.09368896484375,-718.6277465820312],"bone_149":[3.3533787727355957,-56.09368896484375,-718.6277465820312],"bone_150":[16.35671615600586,-43.197940826416016,-722.8917236328125],"bone_151":[31.019683837890625,-4.799109935760498,-718.3546752929688],"bone_152":[14.667909622192383,-36.19730758666992,-736.5130004882812],"bone_153":[13.135481834411621,-47.14341735839844,-753.3206176757812],"bone_154":[7.632974147796631,-51.087547302246094,-745.2764892578125],"bone_155":[16.10017204284668,-47.41942596435547,-746.359130859375],"bone_156":[23.902267456054688,-42.736976623535156,-743.0189819335938],"bone_157":[14.511920928955078,-37.426509857177734,-736.5130004882812],"bone_158":[14.741945266723633,-37.42650604248047,-736.5130004882812],"bone_159":[12.417243957519531,-44.81249237060547,-704.0133666992188],"bone_160":[-3.15295037580654e-05,-49.23347473144531,-708.0444946289062],"bone_161":[10.463821411132812,-5.544134616851807,-636.4673461914062],"bone_162":[71.11295318603516,15.87484073638916,-625.2371826171875],"bone_163":[153.8494873046875,21.144296646118164,-518.7423706054688],"bone_164":[175.92971801757812,10.923502922058105,-475.41546630859375],"bone_165":[198.00997924804688,0.7027029395103455,-432.0885314941406],"bone_166":[206.22601318359375,-15.466632843017578,-423.4410400390625],"bone_167":[220.27757263183594,-23.971874237060547,-383.76385498046875],"bone_168":[220.43545532226562,-25.732009887695312,-364.0750732421875],"bone_169":[217.98306274414062,-26.356889724731445,-350.0535888671875],"bone_170":[213.9944305419922,-26.622041702270508,-335.1905822753906],"bone_171":[208.12513732910156,-8.419836044311523,-422.4184875488281],"bone_172":[225.70574951171875,-11.369311332702637,-381.14752197265625],"bone_173":[224.3411102294922,-12.398106575012207,-360.4752197265625],"bone_174":[220.14976501464844,-12.25479507446289,-345.0858459472656],"bone_175":[215.5662384033203,-11.913273811340332,-330.94769287109375],"bone_176":[210.21490478515625,1.5744553804397583,-421.74822998046875],"bone_177":[224.19390869140625,3.446336507797241,-380.7235107421875],"bone_178":[223.84742736816406,3.145106554031372,-358.4617004394531],"bone_179":[221.20204162597656,3.107203483581543,-345.93402099609375],"bone_180":[216.3881072998047,3.1647913455963135,-331.9457092285156],"bone_181":[209.48280334472656,10.102832794189453,-422.0163269042969],"bone_182":[220.08087158203125,14.26510238647461,-381.9703369140625],"bone_183":[221.62139892578125,15.358020782470703,-365.51348876953125],"bone_184":[220.0510711669922,15.839685440063477,-355.0196228027344],"bone_185":[216.42518615722656,16.326730728149414,-341.4720458984375],"bone_186":[202.24978637695312,1.9425544738769531,-361.6902160644531],"bone_187":[199.2376708984375,-12.932563781738281,-422.6506652832031],"bone_188":[196.78541564941406,-26.36873435974121,-396.039794921875],"bone_189":[195.27342224121094,-35.43128967285156,-376.817626953125],"bone_190":[194.1430206298828,-42.206787109375,-362.4464416503906],"bone_191":[35.15043258666992,-50.745269775390625,-588.469970703125],"bone_192":[81.5755615234375,12.279932022094727,-682.8953247070312]},"mesh_counts":[6585,18943,12384],"mesh_signature":"954594caf59251a16e324ed4f0d00553091559e199bb79d57e503c3330ff38bc"}''')


def build_profile(parent_by_name, keep_fingers=True):
    # (source index, readable name, tail landmark index, bone collection)
    specs = [
        (0, "root", None, "Body"), (1, "pelvis", 56, "Body"),
        (56, "spine_low", 57, "Body"), (57, "spine_mid", 58, "Body"),
        (58, "chest", 111, "Body"), (111, "neck", 112, "Body"),
        (112, "head", 123, "Body"), (113, "jaw", 114, "Face"),
        (79, "clavicle.L", 80, "Body"), (80, "upper_arm.L", 81, "Body"),
        (81, "forearm.L", 83, "Body"), (83, "hand.L", 95, "Body"),
        (161, "clavicle.R", 162, "Body"), (162, "upper_arm.R", 163, "Body"),
        (163, "forearm.R", 165, "Body"), (165, "hand.R", 177, "Body"),
        (10, "thigh.L", 11, "Body"), (11, "shin.L", 12, "Body"),
        (12, "foot.L", 13, "Body"), (13, "toe.L", 14, "Body"),
        (30, "thigh.R", 31, "Body"), (31, "shin.R", 32, "Body"),
        (32, "foot.R", 33, "Body"), (33, "toe.R", 34, "Body"),
        (125, "hair.01", 128, "Hair"), (128, "hair.02", 131, "Hair"),
        (2, "cloth_back.01", 5, "Cloth"), (5, "cloth_back.02", 8, "Cloth"),
        (49, "cloth_front.01", 52, "Cloth"), (52, "cloth_front.02", 55, "Cloth"),
        (16, "hip_panel.L", None, "Cloth"), (36, "hip_panel.R", None, "Cloth"),
        (17, "cloth_side_back.01.L", 20, "Cloth"),
        (20, "cloth_side_back.02.L", 22, "Cloth"),
        (23, "cloth_side_front.01.L", 25, "Cloth"),
        (25, "cloth_side_front.02.L", 27, "Cloth"),
        (37, "cloth_side_back.01.R", 40, "Cloth"),
        (40, "cloth_side_back.02.R", 42, "Cloth"),
        (43, "cloth_side_front.01.R", 45, "Cloth"),
        (45, "cloth_side_front.02.R", 47, "Cloth"),
    ]
    if keep_fingers:
        for side, roots in (("L", (85, 90, 95, 100, 105)),
                            ("R", (167, 172, 177, 182, 187))):
            for finger, root in zip(("index", "middle", "ring", "pinky", "thumb"), roots):
                for joint in range(3):
                    specs.append((root + joint, f"{finger}.{joint + 1:02d}.{side}",
                                  root + joint + 1, "Fingers"))
    # Moia faces world +Y in the supplied import, so world +X is HER RIGHT.
    # v1.0 assigned those limbs .L. Correct every paired name and weight target.
    def corrected_side(name):
        if name.endswith(".L"):
            return name[:-2] + ".R"
        if name.endswith(".R"):
            return name[:-2] + ".L"
        return name

    specs = [{"source": f"bone_{index}", "name": corrected_side(name),
              "tail_landmark": f"bone_{tail}" if tail is not None else None,
              "collection": collection} for index, name, tail, collection in specs]
    retained = {s["source"]: s for s in specs}
    if len(retained) != len(specs):
        raise ValueError("Duplicate source bones in preset.")

    def nearest_retained(name):
        visited = set()
        while name not in retained:
            if name is None or name in visited or name not in parent_by_name:
                raise ValueError(f"No retained ancestor for {name!r}.")
            visited.add(name)
            name = parent_by_name[name]
        return name

    mapping = {name: retained[nearest_retained(name)]["name"] for name in parent_by_name}
    for spec in specs:
        parent = parent_by_name[spec["source"]]
        spec["parent"] = retained[nearest_retained(parent)]["name"] if parent else None
    # Lower jaw is a head articulation; do not preserve the export's strange
    # siblings under neck/head_base when simplifying the head and face.
    next(s for s in specs if s["name"] == "jaw")["parent"] = "head"
    return specs, mapping


def vsub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])


def unit(vector):
    length = math.sqrt(sum(x*x for x in vector))
    if not math.isfinite(length) or length < 1e-10:
        raise ValueError("Degenerate anatomical direction; cannot choose safe bone axes.")
    return tuple(x/length for x in vector)


def palm_normal(heads, side):
    # In this source, bone_83 is the anatomical right wrist, bone_165 the left.
    wrist, index, pinky = (83, 85, 100) if side == "R" else (165, 167, 182)
    normal = cross(vsub(heads[f"bone_{index}"], heads[f"bone_{wrist}"]),
                   vsub(heads[f"bone_{pinky}"], heads[f"bone_{wrist}"]))
    if side == "L":
        normal = tuple(-x for x in normal)
    return unit(normal)


def jaw_shape_point(point, weight, pivot, axis, angle):
    """One weighted rigid jaw rotation in neutral mesh space (LBS)."""
    axis = unit(axis)
    delta = vsub(point, pivot)
    cosine, sine = math.cos(angle), math.sin(angle)
    dot = sum(a*b for a, b in zip(axis, delta))
    perpendicular = cross(axis, delta)
    rotated = tuple(delta[i]*cosine + perpendicular[i]*sine + axis[i]*dot*(1-cosine)
                    for i in range(3))
    return tuple(point[i] + weight*(rotated[i]-delta[i]) for i in range(3))


def vrm0_humanoid_mapping(keep_fingers):
    result = {"hips": "pelvis", "spine": "spine_low", "chest": "spine_mid",
              "upperChest": "chest", "neck": "neck", "head": "head", "jaw": "jaw"}
    for prefix, side in (("left", "L"), ("right", "R")):
        for role, bone in (("Shoulder", "clavicle"), ("UpperArm", "upper_arm"),
                           ("LowerArm", "forearm"), ("Hand", "hand"),
                           ("UpperLeg", "thigh"), ("LowerLeg", "shin"),
                           ("Foot", "foot"), ("Toes", "toe")):
            result[prefix+role] = f"{bone}.{side}"
        if keep_fingers:
            # VRM 0.x thumb uses Proximal/Intermediate/Distal. VRM 1.x differs.
            for role, bone in (("Thumb", "thumb"), ("Index", "index"),
                               ("Middle", "middle"), ("Ring", "ring"), ("Little", "pinky")):
                for joint, suffix in enumerate(("Proximal", "Intermediate", "Distal"), 1):
                    result[prefix+role+suffix] = f"{bone}.{joint:02d}.{side}"
    return result


def configure_vrm0(rig, meshes, humanoid_mapping):
    """Guarded optional integration; never guess another add-on's API."""
    ext = getattr(rig.data, "vrm_addon_extension", None)
    if ext is None or not hasattr(ext, "vrm0"):
        return {"status": "not_detected", "note": "Configure humanoid roles and mouth expression manually using the report."}
    try:
        human_bones = ext.vrm0.humanoid.human_bones
        groups = ext.vrm0.blend_shape_master.blend_shape_groups
        if any(entry.node.bone_name for entry in human_bones) or len(groups):
            return {"status": "not_configured", "note": "New armature already has VRM entries; review them manually rather than overwriting."}
        ext.spec_version = "0.0"
        for role, name in humanoid_mapping.items():
            entry = next((entry for entry in human_bones if entry.bone == role), None)
            if entry is None:
                entry = human_bones.add()
            entry.bone = role
            entry.node.bone_name = name
        mouth_enabled = CREATE_JAW_OPEN_SHAPE and bool(meshes)
        if mouth_enabled:
            # Direct MediaPipe path: a CUSTOM expression named jawOpen.
            # VRM vowel presets require the optional Snek converter module.
            group = groups.add()
            group.name = "jawOpen"
            group.preset_name = "unknown"
            group.is_binary = False
            for obj in meshes:
                bind = group.binds.add()
                bind.mesh.mesh_object_name = obj.name
                bind.index = "jawOpen"  # Blender key NAME, not its integer glTF index.
                bind.weight = 1.0       # Add-on uses 0..1; exported VRM0 uses 0..100.
        actual = {entry.bone: entry.node.bone_name for entry in human_bones if entry.node.bone_name}
        if actual != humanoid_mapping:
            raise RuntimeError("VRM humanoid property assignments did not read back correctly.")
        if mouth_enabled:
            if (group.name != "jawOpen" or group.preset_name != "unknown" or group.is_binary
                    or len(group.binds) != len(meshes)):
                raise RuntimeError("VRM expression properties did not read back correctly.")
            for bind, obj in zip(group.binds, meshes):
                if (bind.mesh.mesh_object_name != obj.name or bind.index != "jawOpen"
                        or abs(bind.weight - 1.0) > 1e-6):
                    raise RuntimeError("VRM mouth bind did not read back correctly.")
        return {"status": "configured_vrm0", "humanoid_roles": len(actual),
                "mouth_expression": "jawOpen" if mouth_enabled else None,
                "note": "Property readback passed. Export, T-pose normalization, metadata/license and SnekStudio behavior still need verification."}
    except Exception as error:
        # Only new rig's entries belong to this operation; clear partial setup.
        for collection in (locals().get("human_bones"), locals().get("groups")):
            if collection is not None:
                collection.clear()
        return {"status": "not_configured", "error": str(error),
                "note": "Unsupported VRM add-on API. Rig/shape remain usable; apply the report's mappings manually before export."}


def remap_vertex_weights(weights, group_names, mapping):
    """Sum source bone weights into targets; preserve unrelated vertex groups."""
    merged, unrelated = {}, []
    for group_index, weight in weights:
        name = group_names[group_index]
        if name in mapping:
            target = mapping[name]
            merged[target] = merged.get(target, 0.0) + float(weight)
        else:
            unrelated.append((name, float(weight)))
    return merged, unrelated


def mesh_signature(vertices, polygons, edges, weights, group_names):
    """Stable hash of ordered geometry and named positive skin weights."""
    digest = hashlib.sha256()
    for position, assignments in zip(vertices, weights):
        digest.update(struct.pack("<3f", *position))
        named = sorted((group_names[index], float(weight)) for index, weight in assignments
                       if weight > 1e-6)
        digest.update(struct.pack("<I", len(named)))
        for name, weight in named:
            encoded = name.encode("utf-8")
            digest.update(struct.pack("<I", len(encoded)))
            digest.update(encoded)
            digest.update(struct.pack("<f", weight))
    for topology in (polygons, edges):
        for indices in topology:
            digest.update(struct.pack("<I", len(indices)))
            digest.update(struct.pack("<" + "I" * len(indices), *indices))
    return digest.hexdigest()


def validate_skin_rows(vertices, assignments, group_names, bone_names, normalize=True, allow_unweighted=False):
    """Validate CURRENT geometry/skinning; utility groups are not skin influences."""
    if not vertices or len(vertices) != len(assignments):
        raise RuntimeError("Empty mesh or incomplete vertex-weight rows.")
    rows, fixed, unweighted = [], 0, 0
    maximum_error = 0.0
    for index, (point, entries) in enumerate(zip(vertices, assignments)):
        if len(point) != 3 or not all(math.isfinite(float(x)) for x in point):
            raise RuntimeError(f"Non-finite geometry at vertex {index}.")
        values = []
        seen = set()
        for group_index, weight in entries:
            if group_index not in group_names or group_index in seen:
                raise RuntimeError(f"Invalid or duplicate group index at vertex {index}.")
            seen.add(group_index)
            if not math.isfinite(weight) or weight < 0 or weight > 1.00001:
                raise RuntimeError(f"Invalid weight at vertex {index}: {weight}.")
            if group_names[group_index] in bone_names and weight > 0:
                values.append((group_index, float(weight)))
        total = sum(weight for _, weight in values)
        if total < 1e-12:
            if allow_unweighted:
                rows.append([])
                unweighted += 1
                continue
            raise RuntimeError(f"Vertex {index} has no positive weights to deform bones. Repair its weights before conversion.")
        maximum_error = max(maximum_error, abs(total - 1))
        if abs(total-1) > 1e-4 and not normalize:
            raise RuntimeError(f"Skin weights at vertex {index} sum to {total:g}; enable NORMALIZE_SOURCE_WEIGHTS or repair them.")
        fixed += int(abs(total-1) > 1e-4)
        rows.append([(group_index, weight/total if normalize else weight) for group_index, weight in values])
    return rows, {"vertices_normalized": fixed, "unweighted_input_vertices": unweighted,
                  "maximum_input_weight_sum_error": maximum_error}


def verify_skeleton(source):
    if GENERIC_PLAN is not None:
        if any(len(p.constraints) for p in source.pose.bones):
            raise RuntimeError("Source pose constraints need a separate control-preservation path.")
        data = source.animation_data
        if (data and data.drivers) or (source.data.animation_data and source.data.animation_data.drivers):
            raise RuntimeError("Source drivers need a separate control-preservation path.")
        return
    expected = EXPECTED_SOURCE
    bones = source.data.bones
    if {b.name for b in bones} != set(expected["parents"]):
        raise RuntimeError("This preset requires the original 193 numbered Moia bones. Select the imported rig, not a previously converted rig.")
    for bone in bones:
        parent = bone.parent.name if bone.parent else None
        if parent != expected["parents"][bone.name]:
            raise RuntimeError(f"Source hierarchy differs at {bone.name}; conversion stopped.")
        reference = expected["heads"][bone.name]
        if max(abs(float(a) - b) for a, b in zip(bone.head_local, reference)) > 0.01:
            raise RuntimeError(f"Source rest geometry differs at {bone.name}; conversion stopped.")
    if any(len(p.constraints) for p in source.pose.bones):
        raise RuntimeError("The source now has pose constraints. This preset is for the imported rig before custom rigging.")
    for animation in (getattr(source, 'animation_data', None), getattr(source.data, 'animation_data', None)):
        if animation and len(animation.drivers):
            raise RuntimeError("Source drivers need a separate control-preservation path.")
    if any(not b.use_deform for b in source.data.bones):
        raise RuntimeError("Moia's deform flags changed; this profile expects every original bone to be deform-enabled.")


def verify_source(source, meshes):
    verify_skeleton(source)
    if not meshes:
        raise RuntimeError("No mesh is bound to the selected armature.")
    checks = []
    skin_rows = []
    for obj in meshes:
        determinant = obj.matrix_world.to_3x3().determinant()
        if not math.isfinite(determinant) or abs(determinant) < 1e-15:
            raise RuntimeError(f"Mesh {obj.name} has a singular or invalid world transform.")
        if obj.data.shape_keys:
            raise RuntimeError(f"Mesh {obj.name} has existing shape keys; preservation is not implemented in this revision.")
        if obj.constraints or obj.animation_data:
            raise RuntimeError(f"Mesh {obj.name} has constraints or animation; review those dependencies first.")
        if len(obj.modifiers) != 1 or obj.modifiers[0].type != "ARMATURE":
            raise RuntimeError(f"Mesh {obj.name} needs a single Armature modifier; apply mesh-editing modifiers first if appropriate.")
        modifier = obj.modifiers[0]
        if modifier.object != source or not modifier.show_viewport or not modifier.show_render:
            raise RuntimeError(f"Mesh {obj.name} has a disabled or mismatched Armature modifier.")
        if modifier.use_bone_envelopes or not modifier.use_vertex_groups or modifier.vertex_group:
            raise RuntimeError(f"Mesh {obj.name} uses envelopes or a modifier mask; this path requires ordinary group skinning.")
        names = {g.index: g.name for g in obj.vertex_groups}
        vertices = [tuple(v.co) for v in obj.data.vertices]
        assignments = [[(g.group, g.weight) for g in v.groups] for v in obj.data.vertices]
        rows, weight_checks = validate_skin_rows(vertices, assignments, names, {b.name for b in source.data.bones if b.use_deform}, NORMALIZE_SOURCE_WEIGHTS, allow_unweighted=GENERIC_PLAN is not None and GENERIC_PLAN['route']=='guided_reconstruction_draft')
        counts = [len(obj.data.vertices), len(obj.data.edges), len(obj.data.polygons)]
        if not counts[2]:
            raise RuntimeError(f"Mesh {obj.name} has no faces.")
        signature = mesh_signature(vertices, [tuple(p.vertices) for p in obj.data.polygons],
                                   [tuple(e.vertices) for e in obj.data.edges], assignments, names)
        exact = len(meshes) == 1 and counts == EXPECTED_SOURCE['mesh_counts'] and signature == EXPECTED_SOURCE['mesh_signature']
        if STRICT_MESH_REFERENCE and GENERIC_PLAN is None and not exact:
            raise RuntimeError("Strict mesh reference checking is enabled and this mesh differs. Set STRICT_MESH_REFERENCE=False to allow cleanup with current-data validation.")
        checks.append({"mesh": obj.name, "counts": counts, "exact_dump_mesh_match": exact,
                       "mesh_reference_policy": "strict" if STRICT_MESH_REFERENCE else "cleanup_allowed",
                       "note": "Current geometry and skinning are used; ordered dump differences are informational.", **weight_checks})
        skin_rows.append(rows)
    return checks, skin_rows


def source_armature(bpy):
    active = bpy.context.view_layer.objects.active
    if active and active.type == "ARMATURE":
        return active
    if active and active.type == "MESH":
        targets = {m.object for m in active.modifiers if m.type == "ARMATURE" and m.object}
        if len(targets) == 1:
            return targets.pop()
    raise RuntimeError("Select the original imported armature or a mesh bound to it, in Object Mode.")


def main():
    import bpy
    from mathutils import Matrix, Vector

    if bpy.context.mode != "OBJECT":
        raise RuntimeError("Switch to Object Mode and select the original armature.")
    source = source_armature(bpy)
    meshes = sorted([o for o in bpy.data.objects if o.type == "MESH" and
                     any(m.type == "ARMATURE" and m.object == source for m in o.modifiers)],
                    key=lambda o: o.name)
    source_checks, source_skin_rows = verify_source(source, meshes)
    parents = {b.name: b.parent.name if b.parent else None for b in source.data.bones}
    specs, mapping = build_profile(parents, KEEP_FINGERS)
    heads = {b.name: source.matrix_world @ b.head_local for b in source.data.bones}
    if GENERIC_PLAN is not None:
        for spec in specs:
            heads[spec['source']] = Vector(spec['head'])
            heads[spec['tail_landmark']] = Vector(spec['tail'])
    # Moia frame follows its source transform; other routes provide a fitted frame.
    # These source-local directions follow a rotated/scaled import correctly.
    up = (source.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
    forward = source.matrix_world.to_3x3() @ Vector((0, -1, 0))
    forward = (forward - up * forward.dot(up)).normalized()
    if GENERIC_PLAN is not None:
        up, forward = Vector(GENERIC_PLAN['up']), Vector(GENERIC_PLAN['forward'])
    if forward.length < 1e-6 or up.length < 1e-6:
        raise RuntimeError("Source transform has a degenerate body frame.")
    palms = ({side:Vector(normal) for side,normal in GENERIC_PLAN['palms'].items()} if GENERIC_PLAN is not None
             else {side: Vector(palm_normal(heads, side)) for side in ("L", "R")} if KEEP_FINGERS else {})
    if not math.isfinite(JAW_OPEN_DEGREES) or not 0 < JAW_OPEN_DEGREES <= 45:
        raise RuntimeError("JAW_OPEN_DEGREES must be greater than zero and at most 45.")
    orientation_matrix = Matrix.Identity(4)
    if CANONICALIZE_FOR_VRM0:
        pivot = (Vector(next(s['head'] for s in specs if s['name']=='pelvis'))
                 if GENERIC_PLAN is not None else heads['bone_1'])
        orientation_matrix = Matrix(canonical_frame(tuple(up),tuple(forward),tuple(pivot)))
        heads = {name:orientation_matrix@point for name,point in heads.items()}
        palms = {side:orientation_matrix.to_3x3()@normal for side,normal in palms.items()}
        up,forward = Vector((0,0,1)),Vector((0,1,0))
    offset = Vector(OUTPUT_OFFSET)
    if len(offset) != 3 or not all(math.isfinite(float(x)) for x in offset):
        raise RuntimeError("OUTPUT_OFFSET must contain three finite numbers.")
    profile = GENERIC_PLAN["profile"] if GENERIC_PLAN is not None else "Fingers70" if KEEP_FINGERS else "Compact40"
    selected_before = list(bpy.context.selected_objects)
    active_before = bpy.context.view_layer.objects.active
    source_visibility = [(obj, obj.hide_get(), obj.hide_render) for obj in [source] + meshes]
    collection = None
    created_objects, created_data, created_texts = [], [], []
    try:
        collection = bpy.data.collections.new(f"RuneRig_{profile}")
        bpy.context.scene.collection.children.link(collection)
        armature_data = bpy.data.armatures.new(f"RuneRig_{profile}_Skeleton")
        created_data.append(("armature", armature_data))
        rig = bpy.data.objects.new(f"RuneRig_{profile}_Rig", armature_data)
        created_objects.append(rig)
        collection.objects.link(rig)
        rig.matrix_world = Matrix.Identity(4)
        rig.show_in_front = True
        armature_data.display_type = "OCTAHEDRAL"
        armature_data.pose_position = "POSE"
        for obj in selected_before:
            obj.select_set(False)
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode="EDIT")
        for spec in specs:
            bone = armature_data.edit_bones.new(spec["name"])
            bone.head = heads[spec["source"]] + offset
            if spec["tail_landmark"]:
                bone.tail = heads[spec["tail_landmark"]] + offset
            elif spec["name"] == "root":
                bone.tail = bone.head + Vector((0, 0, 0.08))
            else:
                bone.tail = bone.head + Vector((0, 0, -0.08))
            if (bone.tail - bone.head).length < 1e-5:
                bone.tail = bone.head + Vector((0, 0, 0.025))
            roll_axis = forward.copy()
            if spec["collection"] == "Fingers" and not spec["name"].startswith("thumb."):
                # Local +X curl now bends toward the palm, not a global forward
                # direction shared by every finger on both hands.
                roll_axis = palms[spec["name"][-1]].copy()
            if abs((bone.tail - bone.head).normalized().dot(roll_axis)) > 0.95:
                roll_axis = up.copy()
            bone.align_roll(roll_axis)
            bone.use_deform = spec["name"] != "root"
            bone.use_connect = False
        for spec in specs:
            if spec["parent"]:
                armature_data.edit_bones[spec["name"]].parent = armature_data.edit_bones[spec["parent"]]
        bpy.ops.object.mode_set(mode="OBJECT")
        for label in sorted({s["collection"] for s in specs}):
            bone_collection = armature_data.collections.new(label)
            for spec in specs:
                if spec["collection"] == label:
                    bone_collection.assign(armature_data.bones[spec["name"]])
            bone_collection.is_visible = label in {"Body", "Face"}
        for pose_bone in rig.pose.bones:
            pose_bone.rotation_mode = "XYZ"
            pose_bone.matrix_basis = Matrix.Identity(4)
        rig["preset_version"] = PRESET_VERSION
        rig["source_rig_name"] = source.name
        rig["weight_mapping_json"] = json.dumps(mapping if GENERIC_PLAN is None or GENERIC_PLAN['explicit_weights'] is None else
                                               {'strategy':'per_vertex_guided_geometry_and_region_overrides'}, separators=(",", ":"))
        checks = []
        result_meshes = []
        for mesh_index, original in enumerate(meshes):
            new_mesh = original.data.copy()
            created_data.append(("mesh", new_mesh))
            obj = original.copy()
            created_objects.append(obj)
            obj.data = new_mesh
            obj.name = f"RuneRig_{profile}_Mesh"
            collection.objects.link(obj)
            result_meshes.append(obj)
            obj.animation_data_clear()
            obj.parent = rig
            obj.matrix_parent_inverse = Matrix.Identity(4)
            obj.matrix_basis = Matrix.Identity(4)
            obj.matrix_world = Matrix.Identity(4)
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.hide_render = False
            # Capture original custom corner normals by face and vertex before
            # reversing winding. Rebuild their association after the mirror.
            custom_normals = None
            if original.data.has_custom_normals:
                custom_normals = [
                    {original.data.loops[i].vertex_index: original.data.corner_normals[i].vector.copy()
                     for i in polygon.loop_indices}
                    for polygon in original.data.polygons]
            transform = orientation_matrix @ original.matrix_world
            new_mesh.transform(transform)
            if transform.to_3x3().determinant() < 0:
                new_mesh.flip_normals()
            if custom_normals is not None:
                normal_matrix = transform.to_3x3().inverted().transposed()
                transformed = [None] * len(new_mesh.loops)
                for polygon in new_mesh.polygons:
                    for i in polygon.loop_indices:
                        normal = normal_matrix @ custom_normals[polygon.index][new_mesh.loops[i].vertex_index]
                        transformed[i] = normal.normalized()
                new_mesh.normals_split_custom_set(transformed)
            for vertex in new_mesh.vertices:
                vertex.co += offset
            new_mesh.update()
            expected_world = [(orientation_matrix @ original.matrix_world @ vertex.co) + offset
                              for vertex in original.data.vertices]
            group_names = {g.index: g.name for g in original.vertex_groups}
            remapped = [remap_vertex_weights(row, group_names, mapping)[0]
                        for row in source_skin_rows[mesh_index]]
            if GENERIC_PLAN is not None and GENERIC_PLAN['explicit_weights'] is not None:
                remapped = GENERIC_PLAN['explicit_weights'][mesh_index]
            existing = set(g.name for g in obj.vertex_groups)
            destination_names = {s["name"] for s in specs}
            for name in destination_names:
                if name in existing and name not in mapping:
                    raise RuntimeError(f"Destination group collision: {name}")
            for group in list(obj.vertex_groups):
                if group.name in mapping:
                    obj.vertex_groups.remove(group)
            targets = {name: obj.vertex_groups.new(name=name) for name in sorted(destination_names)}
            for index, weights in enumerate(remapped):
                for name, weight in weights.items():
                    if weight < 0 or weight > 1.00001:
                        raise RuntimeError(f"Invalid transferred weight at vertex {index}: {weight}")
                    if weight > 0:
                        targets[name].add([index], min(1.0, weight), "REPLACE")
            modifier = next(m for m in obj.modifiers if m.type == "ARMATURE")
            modifier.object = rig
            modifier.use_vertex_groups = True
            modifier.use_bone_envelopes = False
            # Verify actual Blender-stored weights, not only the pre-write map.
            new_group_names = {g.index: g.name for g in obj.vertex_groups}
            maximum_sum_error = 0.0
            for index, vertex in enumerate(new_mesh.vertices):
                actual = {new_group_names[g.group]: g.weight for g in vertex.groups}
                expected = remapped[index]
                for name, weight in expected.items():
                    if abs(actual.get(name, 0) - min(weight, 1.0)) > 1e-5:
                        raise RuntimeError(f"Transferred weights did not verify at vertex {index}, {name}.")
                total = sum(actual.get(name, 0) for name in targets)
                maximum_sum_error = max(maximum_sum_error, abs(total - 1.0))
                if not total or abs(total - 1.0) > 1e-4:
                    raise RuntimeError(f"Unweighted or non-normalized vertex after transfer: {index}")
            bpy.context.view_layer.update()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated = obj.evaluated_get(depsgraph)
            evaluated_mesh = evaluated.to_mesh()
            try:
                if len(evaluated_mesh.vertices) != len(expected_world):
                    raise RuntimeError("Evaluated mesh topology changed during validation.")
                maximum_rest_error = max(((evaluated.matrix_world @ v.co) - expected_world[i]).length
                                         for i, v in enumerate(evaluated_mesh.vertices))
            finally:
                evaluated.to_mesh_clear()
            if maximum_rest_error > 1e-5:
                raise RuntimeError(f"Rest-shape validation failed: max world-space error {maximum_rest_error:g}")
            mouth_changed_vertices = 0
            mouth_max_displacement = 0.0
            if CREATE_JAW_OPEN_SHAPE and any(row.get('jaw', 0) > 0 for row in remapped):
                obj.shape_key_add(name="Basis", from_mix=False)
                mouth = obj.shape_key_add(name="jawOpen", from_mix=False)
                pivot = heads[GENERIC_PLAN["jaw_source"] if GENERIC_PLAN is not None else "bone_113"] + offset
                axis = forward.cross(up).normalized()
                angle = -math.radians(JAW_OPEN_DEGREES)
                for index, vertex in enumerate(new_mesh.vertices):
                    point = jaw_shape_point(vertex.co, remapped[index].get("jaw", 0), pivot, axis, angle)
                    mouth.data[index].co = point
                    displacement = (mouth.data[index].co - vertex.co).length
                    if displacement > 1e-7:
                        mouth_changed_vertices += 1
                        mouth_max_displacement = max(mouth_max_displacement, displacement)
                mouth.value = 0.0
                if not mouth_changed_vertices:
                    raise RuntimeError("jawOpen shape has no visible displacement.")
                # Confirm all stored key coordinates, not just the intended math.
                for index, vertex in enumerate(new_mesh.vertices):
                    expected = Vector(jaw_shape_point(vertex.co, remapped[index].get("jaw", 0), pivot, axis, angle))
                    if (mouth.data[index].co - expected).length > 1e-5:
                        raise RuntimeError(f"jawOpen shape failed coordinate validation at vertex {index}.")
            checks.append({"mesh": obj.name, "vertex_count": len(new_mesh.vertices),
                           "max_weight_sum_error": maximum_sum_error,
                           "max_rest_world_error": maximum_rest_error,
                           "mouth_changed_vertices": mouth_changed_vertices,
                           "mouth_max_displacement": mouth_max_displacement})
        humanoid_mapping = vrm0_humanoid_mapping(KEEP_FINGERS)
        mouth_meshes = [o for o in result_meshes if o.data.shape_keys and o.data.shape_keys.key_blocks.get('jawOpen')]
        vrm_setup = configure_vrm0(rig, mouth_meshes, humanoid_mapping) if CONFIGURE_VRM0 else {"status": "disabled"}
        validation = {"preset": PRESET_VERSION, "profile": profile,
                      "source_bones": len(source.data.bones), "result_bones": len(specs),
                      "source_checks": source_checks, "checks": checks, "vrm_setup": vrm_setup,
                      "route": GENERIC_PLAN['route'] if GENERIC_PLAN is not None else 'moia_layout',
                      "canonical_orientation_enabled": CANONICALIZE_FOR_VRM0,
                      "world_orientation_transform": [list(row) for row in orientation_matrix],
                      "weight_strategy": 'per_vertex_guided_geometry_and_region_overrides' if GENERIC_PLAN is not None and GENERIC_PLAN['explicit_weights'] is not None else 'source_group_map',
                      "route_limits": GENERIC_PLAN['limits'] if GENERIC_PLAN is not None else 'Moia 1.2 profile; tracking still needs runtime testing.',
                      "region_override_vertices": GENERIC_PLAN.get('region_override_vertices', 0) if GENERIC_PLAN is not None else 0,
                      "source_region_vertices": GENERIC_PLAN.get('source_region_vertices', 0) if GENERIC_PLAN is not None else 0,
                      "partial_source_region_vertices": GENERIC_PLAN.get('partial_source_region_vertices', 0) if GENERIC_PLAN is not None else 0,
                      "source_region_targets": GENERIC_PLAN.get('source_region_targets', {}) if GENERIC_PLAN is not None else {},
                      "guided_profile_reused": GENERIC_PLAN.get('guided_profile_reused', False) if GENERIC_PLAN is not None else False,
                      "guided_profile_name": GENERIC_PLAN.get('guided_profile_name') if GENERIC_PLAN is not None else None,
                      "guided_seam_checks": GENERIC_PLAN.get('guided_seam_checks', []) if GENERIC_PLAN is not None else [],
                      "vrm0_humanoid_mapping": humanoid_mapping,
                      "changes": ("Moia 1.1 anatomical/finger/mouth fixes retained; cleanup allowed." if GENERIC_PLAN is None
                                  else "Named humanoid roles fitted; existing skin and weighted extras retained." if GENERIC_PLAN['route']=='named_humanoid'
                                  else "Fitted body landmarks reconstructed; new per-vertex body weights; rigid hands, no face morphs."),
                      "limits": "Neutral weights/geometry and mouth coordinates verified. Export normalization and SnekStudio tracking still need runtime testing. No IK, original clips, or detailed viseme shapes."}
        rig["conversion_validation_json"] = json.dumps(validation)
        text = bpy.data.texts.new(f"RuneRig_{profile}_ConversionReport.txt")
        created_texts.append(text)
        text.write(json.dumps(validation, indent=2) +
                   ("\n\nGuided weights are per vertex, not a source-group merge.\n" if GENERIC_PLAN is not None and GENERIC_PLAN['explicit_weights'] is not None
                    else "\n\nSOURCE BONE -> DESTINATION\n"+"\n".join(f"{name} -> {mapping[name]}" for name in sorted(mapping))))
        if HIDE_SOURCE_AFTER_SUCCESS:
            for original in [source] + meshes:
                original.hide_set(True)
                original.hide_render = True
        bpy.ops.object.mode_set(mode="POSE")
        print(json.dumps(validation, indent=2))
        def draw_popup(self, context):
            self.layout.label(text=f"Created {len(specs)}-bone rig in {collection.name}")
            self.layout.label(text="Rest shape and vertex weights verified.")
            self.layout.label(text=f"VRM setup: {vrm_setup['status']}; inspect ConversionReport.")
            self.layout.label(text="Pose the new rig; inspect elbows, wrists, knees, and cloth.")
            self.layout.label(text="Original remains intact, hidden in viewport/render.")
        try:
            bpy.context.window_manager.popup_menu(draw_popup, title="Rune Rig conversion complete", icon="INFO")
        except Exception:
            pass
    except Exception:
        # Roll back only data created by this run. Never remove source data.
        if bpy.context.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
        for obj, hidden, hidden_render in source_visibility:
            obj.hide_set(hidden)
            obj.hide_render = hidden_render
        for obj in reversed(created_objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for kind, data in reversed(created_data):
            if data.users == 0:
                if kind == "mesh":
                    bpy.data.meshes.remove(data)
                else:
                    bpy.data.armatures.remove(data)
        for text in created_texts:
            bpy.data.texts.remove(text)
        if collection is not None:
            bpy.data.collections.remove(collection)
        for obj in selected_before:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active_before
        raise


ROLE_TARGETS = {
    "hips": "pelvis", "spine": "spine_low", "chest": "chest",
    "upperChest": "upper_chest", "neck": "neck", "head": "head", "jaw": "jaw",
}
for _side, _suffix in (("left", "L"), ("right", "R")):
    for _role, _name in (("Shoulder", "clavicle"), ("UpperArm", "upper_arm"),
                         ("LowerArm", "forearm"), ("Hand", "hand"),
                         ("UpperLeg", "thigh"), ("LowerLeg", "shin"),
                         ("Foot", "foot"), ("Toes", "toe")):
        ROLE_TARGETS[_side+_role] = _name+"."+_suffix
    for _role, _name in (("Thumb", "thumb"), ("Index", "index"),
                         ("Middle", "middle"), ("Ring", "ring"), ("Little", "pinky")):
        for _i, _joint in enumerate(("Proximal", "Intermediate", "Distal"), 1):
            ROLE_TARGETS[_side+_role+_joint] = f"{_name}.{_i:02d}.{_suffix}"

REQUIRED_ROLES = ("hips", "spine", "head", "leftUpperArm", "leftLowerArm", "leftHand",
                  "rightUpperArm", "rightLowerArm", "rightHand", "leftUpperLeg",
                  "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot")


def canonical_name(name):
    # Explicit alias matching, not substring guessing for numbered rigs.
    value = name.split(":")[-1]
    return "".join(c.lower() for c in value if c.isalnum())


def canonical_frame(up, forward, pivot):
    up = unit(up)
    forward = unit(tuple(forward[i]-up[i]*sum(a*b for a,b in zip(up,forward)) for i in range(3)))
    right = unit(cross(forward,up))
    rows = [list(axis)+[pivot[i]-sum(x*y for x,y in zip(axis,pivot))] for i,axis in enumerate((right,forward,up))]
    return rows+[[0,0,0,1]]


def resolve_named_roles(names, explicit=None):
    aliases = {"hips": ("Hips", "pelvis"), "spine": ("Spine", "spine_low"),
               "chest": ("Spine1", "chest"), "upperChest": ("Spine2", "upper_chest"),
               "neck": ("Neck",), "head": ("Head",), "jaw": ("Jaw",)}
    for side, suffix in (("Left", "L"), ("Right", "R")):
        prefix = side.lower()
        for role, mixamo, target in (("Shoulder", "Shoulder", "clavicle"),
                                     ("UpperArm", "Arm", "upper_arm"),
                                     ("LowerArm", "ForeArm", "forearm"),
                                     ("Hand", "Hand", "hand"), ("UpperLeg", "UpLeg", "thigh"),
                                     ("LowerLeg", "Leg", "shin"), ("Foot", "Foot", "foot"),
                                     ("Toes", "ToeBase", "toe")):
            aliases[prefix+role] = (side+mixamo, target+"."+suffix)
        for finger, target in (("Thumb", "thumb"), ("Index", "index"),
                               ("Middle", "middle"), ("Ring", "ring"), ("Little", "pinky")):
            for i,joint in enumerate(("Proximal", "Intermediate", "Distal"),1):
                aliases[prefix+finger+joint] = (side+"Hand"+("Pinky" if finger=="Little" else finger)+str(i),
                                                f"{target}.{i:02d}.{suffix}")
    by_key = {}
    for name in names:
        by_key.setdefault(canonical_name(name), []).append(name)
    result = {}
    for role, values in aliases.items():
        matches = {n for alias in (*values, role) for n in by_key.get(canonical_name(alias), [])}
        if len(matches) == 1:
            result[role] = matches.pop()
    for role, name in (explicit or {}).items():
        if role not in ROLE_TARGETS or name not in names:
            raise RuntimeError(f"Invalid humanoid role override: {role} -> {name}")
        result[role] = name
    if len(set(result.values())) != len(result):
        raise RuntimeError("One source bone is assigned to multiple humanoid roles.")
    return result


def build_named_profile(parents, roles, weighted):
    missing = [r for r in REQUIRED_ROLES if r not in roles]
    if missing:
        raise RuntimeError("Incomplete humanoid role map: " + ", ".join(missing))
    # Verify required limb chains; flat legacy group centers are not joints.
    def ancestor(a, b):
        seen = set()
        while b is not None and b not in seen:
            if b == a:
                return True
            seen.add(b)
            b = parents.get(b)
        return False
    for side in ("left", "right"):
        for a,b in (("UpperArm", "LowerArm"), ("LowerArm", "Hand"),
                    ("UpperLeg", "LowerLeg"), ("LowerLeg", "Foot")):
            if not ancestor(roles[side+a], roles[side+b]):
                raise RuntimeError(f"{side+b} is not a descendant of {side+a}. Use GUIDED reconstruction for flat rigs.")
    if not ancestor(roles['hips'], roles['spine']) or not ancestor(roles['spine'], roles['head']):
        raise RuntimeError("Hips/spine/head do not form a chain. Review roles or use GUIDED reconstruction.")
    role_for_source = {name: role for role,name in roles.items()}
    retained = set(roles.values()) | set(weighted)
    retained.update(name for name,parent in parents.items() if parent is None)
    targets = {}
    for name in sorted(retained):
        if name in role_for_source:
            targets[name] = ROLE_TARGETS[role_for_source[name]]
        elif parents[name] is None and name not in weighted:
            targets[name] = "root" if "root" not in targets.values() else "extra_"+name
        else:
            targets[name] = "extra_"+name
    if len(set(targets.values())) != len(targets):
        raise RuntimeError("Destination bone names collide; review the source names.")
    def nearest(name):
        seen = set()
        while name is not None and name not in retained:
            if name in seen or name not in parents:
                raise RuntimeError("Invalid source hierarchy.")
            seen.add(name)
            name = parents[name]
        return name
    specs = []
    for name in sorted(retained):
        role = role_for_source.get(name)
        label = "Fingers" if role and any(f in role for f in ("Thumb", "Index", "Middle", "Ring", "Little")) else "Body" if role else "Extras"
        if role == "jaw":
            label = "Face"
        parent = nearest(parents[name])
        specs.append({"source": name, "name": targets[name], "tail_landmark": None,
                      "parent": targets[parent] if parent else None, "collection": label,
                      "use_source_tail": True})
    mapping = {name: targets[nearest(name)] for name in parents}
    humanoid = {role: targets[name] for role,name in roles.items()}
    return specs, mapping, humanoid


def named_tail_landmarks(roles):
    result = {}
    torso = [r for r in ('hips','spine','chest','upperChest','neck','head') if r in roles]
    for a,b in zip(torso,torso[1:]): result[roles[a]] = roles[b]
    for side in ('left','right'):
        for chain in (('Shoulder','UpperArm','LowerArm','Hand'), ('UpperLeg','LowerLeg','Foot','Toes')):
            present = [side+r for r in chain if side+r in roles]
            for a,b in zip(present,present[1:]): result[roles[a]] = roles[b]
        for finger in ('Thumb','Index','Middle','Ring','Little'):
            chain = [side+finger+j for j in ('Proximal','Intermediate','Distal') if side+finger+j in roles]
            for a,b in zip(chain,chain[1:]): result[roles[a]] = roles[b]
        for finger in ('Middle','Index','Ring'):
            if side+'Hand' in roles and side+finger+'Proximal' in roles:
                result[roles[side+'Hand']] = roles[side+finger+'Proximal']
                break
    return result


def distance_to_segment(point, head, tail):
    direction = vsub(tail, head)
    length2 = sum(x*x for x in direction)
    if length2 < 1e-18:
        raise RuntimeError("Zero-length guided bone.")
    t = max(0.0, min(1.0, sum(x*y for x,y in zip(vsub(point, head), direction))/length2))
    return math.sqrt(sum((point[i]-head[i]-t*direction[i])**2 for i in range(3)))


def validate_source_region_targets(rules, parents, specs):
    targets = {s['name'] for s in specs if s['name'] != 'root'}
    if not isinstance(rules, dict):
        raise RuntimeError('GUIDED_SOURCE_REGION_TARGETS must be a dictionary.')
    for name,target in rules.items():
        if not isinstance(name,str) or not isinstance(target,str) or name not in parents or target not in targets:
            raise RuntimeError(f'Invalid guided source region: {name} -> {target}. Use an existing source bone and body target.')
    return dict(rules)


def source_region_weights(skin, rules):
    """A whole-region rule applies only if it covers all positive source skin."""
    if not skin or any(name not in rules for name in skin):
        return None
    values = {}
    for name,w in skin.items():
        if not math.isfinite(w) or w < 0:
            raise RuntimeError('Invalid source weight in guided region assignment.')
        values[rules[name]] = values.get(rules[name],0)+w
    total = sum(values.values())
    return {name:w/total for name,w in values.items() if w>0} if total>0 else None


def guided_seam_weight_conflicts(points, rows):
    """Exact coincident vertices may be seams or separate layers; report, never weld."""
    first = {}
    conflicts = set()
    for point,row in zip(points,rows):
        key = tuple(point)
        if key in first:
            other = first[key]
            if any(abs(row.get(n,0)-other.get(n,0))>1e-6 for n in set(row)|set(other)):
                conflicts.add(key)
        else:
            first[key] = row
    return len(conflicts)


def make_guided_profile(name, parents, heads, local_markers, rules):
    required = set(marker_seed([(0,0,0),(1,1,1)],(0,0,1),(0,-1,0)))
    if set(local_markers) != required:
        raise RuntimeError('A reusable profile requires exactly the 25 body/direction landmarks.')
    profile = {'rune_rig_profile':1,'name':name,
               'source':{'parents':dict(parents),'heads':{n:list(p) for n,p in heads.items()}},
               'landmarks_armature_space':{n:list(p) for n,p in local_markers.items()},
               'source_region_targets':dict(rules)}
    # Reject non-finite data rather than writing unusable JSON.
    json.dumps(profile,allow_nan=False)
    return profile


def guided_profile_matches(profile, parents, heads):
    if not isinstance(profile,dict) or profile.get('rune_rig_profile') != 1:
        return False
    source = profile.get('source',{})
    if not isinstance(source,dict) or source.get('parents') != parents:
        return False
    saved = source.get('heads',{})
    if not isinstance(saved,dict) or set(saved) != set(heads):
        return False
    try:
        return all(len(saved[n])==3 and all(math.isfinite(float(a)) and abs(float(a)-float(b))<=.01
                   for a,b in zip(saved[n],p)) for n,p in heads.items())
    except (TypeError,ValueError):
        return False


def profile_landmarks(profile):
    points = profile.get('landmarks_armature_space')
    required = set(marker_seed([(0,0,0),(1,1,1)],(0,0,1),(0,-1,0)))
    if not isinstance(points,dict) or set(points) != required:
        raise RuntimeError('Saved guided profile is missing body/direction landmarks. Refit with CONVERSION_MODE="GUIDED".')
    if not isinstance(profile.get('source_region_targets'),dict):
        raise RuntimeError('Saved guided profile has invalid source region rules.')
    try:
        if not all(len(p)==3 and all(math.isfinite(float(v)) for v in p) for p in points.values()):
            raise ValueError()
        return {n:tuple(float(v) for v in p) for n,p in points.items()}
    except (TypeError,ValueError):
        raise RuntimeError('Saved guided profile contains invalid landmark coordinates.') from None


def choose_guided_profile(explicit_json, texts, parents, heads):
    if explicit_json.strip():
        try:
            profile = json.loads(explicit_json)
        except ValueError:
            raise RuntimeError('GUIDED_PROFILE_JSON is invalid JSON.') from None
        if not guided_profile_matches(profile,parents,heads):
            raise RuntimeError('The supplied guided profile belongs to a different skeleton/rest layout. Refit with GUIDED or clear GUIDED_PROFILE_JSON.')
        profile_landmarks(profile)
        return profile
    candidates = []
    for name,body in texts:
        if not body.lstrip().startswith('{') or '"rune_rig_profile"' not in body:
            continue
        try:
            profile = json.loads(body)
        except ValueError:
            continue
        if guided_profile_matches(profile,parents,heads):
            profile_landmarks(profile)
            candidates.append(profile)
    # Two names with identical fitted data are harmless; conflicting fits require a choice.
    unique = {json.dumps({k:p[k] for k in ('source','landmarks_armature_space','source_region_targets')},sort_keys=True):p for p in candidates}
    if len(unique)>1:
        raise RuntimeError('Multiple different guided profiles match this skeleton. Paste the desired profile into GUIDED_PROFILE_JSON, or use GUIDED to refit.')
    return next(iter(unique.values()),None)


def save_guided_profile_text(bpy, source, profile):
    text = next((t for t in bpy.data.texts if t.get('rune_rig_profile_source')==source.name),None)
    if text is None:
        text = bpy.data.texts.new('RuneRigProfile_'+source.name+'.json')
        text['rune_rig_profile_source'] = source.name
    else:
        text.clear()
    text.use_fake_user = True
    text.write(json.dumps(profile,indent=2,allow_nan=False))
    print('Reusable fitted profile saved in Blender Text:',text.name)
    return text.name


def guided_vertex_weights(point, specs, scale, override=None):
    """Geometry-only draft, with explicit per-vertex region weights taking priority."""
    names = {s['name'] for s in specs if s['name'] != 'root'}
    if override:
        if any(name not in names or not math.isfinite(w) or w < 0 for name,w in override.items()):
            raise RuntimeError("Invalid RR: region override.")
        total = sum(override.values())
        if total > 0:
            return {name:w/total for name,w in override.items() if w > 0}
    candidates = [s for s in specs if s['name'] != 'root']
    distances = {s['name']:distance_to_segment(point,s['head'],s['tail']) for s in candidates}
    closest = min(candidates, key=lambda s:(distances[s['name']],s['name']))
    # Blend only adjacent bones, so proximity cannot blend a hand with a hip.
    neighbors = [s for s in candidates if s['name']==closest['parent'] or s['parent']==closest['name']]
    selected = [closest]
    if neighbors:
        selected.append(min(neighbors,key=lambda s:(distances[s['name']],s['name'])))
    radius = max(scale*.025, 1e-8)
    values = {s['name']:1/(distances[s['name']]+radius)**4 for s in selected}
    total = sum(values.values())
    return {name:w/total for name,w in values.items()}


def guided_specs(markers):
    central = [("pelvis", "pelvis", "spine_low", "root", "hips"),
               ("spine_low", "spine_low", "chest", "pelvis", "spine"),
               ("chest", "chest", "neck", "spine_low", "chest"),
               ("neck", "neck", "head", "chest", "neck"),
               ("head", "head", "head_tip", "neck", "head")]
    result = []
    humanoid = {}
    for name, head, tail, parent, role in central:
        result.append({'name':name,'head':markers[head],'tail':markers[tail],'parent':parent,'collection':'Body'})
        humanoid[role] = name
    for prefix,side in (("left","L"),("right","R")):
        for name, head, tail, parent, role in (
                ('clavicle','clavicle','shoulder','chest','Shoulder'),
                ('upper_arm','shoulder','elbow','clavicle.'+side,'UpperArm'),
                ('forearm','elbow','wrist','upper_arm.'+side,'LowerArm'),
                ('hand','wrist','hand_tip','forearm.'+side,'Hand'),
                ('thigh','hip','knee','pelvis','UpperLeg'),
                ('shin','knee','ankle','thigh.'+side,'LowerLeg'),
                ('foot','ankle','toe','shin.'+side,'Foot'),
                ('toe','toe','toe_tip','foot.'+side,'Toes')):
            head_point = markers[head+'.'+side] if head != 'clavicle' else tuple(markers['chest'][i]*.8+markers['shoulder.'+side][i]*.2 for i in range(3))
            result.append({'name':name+'.'+side,'head':head_point,'tail':markers[tail+'.'+side],
                           'parent':parent,'collection':'Body'})
            humanoid[prefix+role] = name+'.'+side
    up = unit(vsub(markers['head'], markers['pelvis']))
    height = math.dist(markers['head_tip'], tuple((markers['ankle.L'][i]+markers['ankle.R'][i])/2 for i in range(3)))
    result.insert(0, {'name':'root','head':markers['pelvis'],
                      'tail':tuple(markers['pelvis'][i]+up[i]*height*.05 for i in range(3)),
                      'parent':None,'collection':'Body'})
    for spec in result:
        if math.dist(spec['head'],spec['tail']) < height*1e-5:
            raise RuntimeError(f"Landmarks for {spec['name']} coincide; position them before converting.")
        spec['source'] = 'guide:'+spec['name']
        spec['tail_landmark'] = 'guide_tail:'+spec['name']
    return result, humanoid, height


def marker_seed(points, up, forward):
    up, forward = unit(up), unit(forward)
    forward = unit(tuple(forward[i]-up[i]*sum(a*b for a,b in zip(up,forward)) for i in range(3)))
    left = unit(cross(up, forward))
    def dot(p,a): return sum(x*y for x,y in zip(p,a))
    bounds = [(min(dot(p,a) for p in points), max(dot(p,a) for p in points)) for a in (left,forward,up)]
    height = bounds[2][1]-bounds[2][0]
    if height < 1e-8:
        raise RuntimeError("Mesh has no height along GUIDED_UP.")
    center = [(lo+hi)/2 for lo,hi in bounds]
    half_width = (bounds[0][1]-bounds[0][0])/2
    def location(x,y,z):
        coord = (center[0]+x*half_width, center[1]+y*height, bounds[2][0]+z*height)
        return tuple(sum(coord[j]*axis[i] for j,axis in enumerate((left,forward,up))) for i in range(3))
    markers = {name:location(0,0,z) for name,z in (('pelvis',.51),('spine_low',.62),('chest',.77),
                                                 ('neck',.85),('head',.90),('head_tip',.99))}
    markers['forward'] = location(0,.25,.77)
    for side,sign in (('L',1),('R',-1)):
        for name,x,y,z in (('shoulder',.44,0,.81),('elbow',.68,-.015,.68),('wrist',.82,0,.51),
                           ('hand_tip',.84,.005,.44),('hip',.29,0,.49),('knee',.29,.015,.29),
                           ('ankle',.29,0,.06),('toe',.29,.10,.025),('toe_tip',.29,.15,.025)):
            markers[name+'.'+side] = location(sign*x,y,z)
    return markers


def find_or_create_guides(bpy, source, points):
    collection = next((c for c in bpy.data.collections if c.get('rune_rig_guide_source') == source.name), None)
    if collection is None:
        collection = bpy.data.collections.new(source.name+'_RuneRig_Landmarks')
        collection['rune_rig_guide_source'] = source.name
        bpy.context.scene.collection.children.link(collection)
    owned = {o.get('rune_rig_landmark'):o for o in collection.objects if o.get('rune_rig_landmark')}
    seeds = marker_seed(points, GUIDED_UP, GUIDED_FORWARD)
    created = []
    for name, point in seeds.items():
        if name not in owned:
            obj = bpy.data.objects.new('RR_'+name, None)
            obj['rune_rig_landmark'] = name
            obj.empty_display_type = 'SPHERE'
            obj.empty_display_size = max(math.dist(seeds['head_tip'],seeds['ankle.L'])*.012, .001)
            obj.show_name = True
            obj.show_in_front = True
            obj.location = point
            collection.objects.link(obj)
            owned[name] = obj
            created.append(name)
    collection.hide_viewport = False
    collection.hide_render = True
    if created or not GUIDED_LANDMARKS_READY:
        message = ('Created landmark seeds. ' if created else 'Kept existing landmark positions. ')
        message += ('Position the RR_ joint markers in world space; RR_forward goes in front of the chest. '
                    'Set GUIDED_LANDMARKS_READY=True in this script and run again. '
                    'Guided output has rigid hands and approximate body weights; test bends before export.')
        print(message)
        text = bpy.data.texts.new(source.name+'_RuneRig_LandmarkInstructions.txt')
        text.write(message)
        def popup(self, context):
            self.layout.label(text='Position the RR_ joint markers, then set GUIDED_LANDMARKS_READY=True.')
            self.layout.label(text='Existing marker positions are preserved. Original rig is untouched.')
            self.layout.label(text='Guided weights are a draft; rigid hands, no automatic facial morphs.')
        bpy.context.window_manager.popup_menu(popup,title='Rune Rig: landmark fitting',icon='INFO')
        return None
    return {name:tuple(obj.matrix_world.translation) for name,obj in owned.items()}


def universal_main():
    import bpy
    from mathutils import Vector
    global GENERIC_PLAN, EXPECTED_SOURCE, PRESET_VERSION, CREATE_JAW_OPEN_SHAPE
    global build_profile, palm_normal, vrm0_humanoid_mapping
    if CONVERSION_MODE not in ('AUTO','GUIDED'):
        raise RuntimeError('CONVERSION_MODE must be AUTO or GUIDED.')
    if bpy.context.mode != 'OBJECT':
        raise RuntimeError('Switch to Object Mode and select the original armature or its bound mesh.')
    source = source_armature(bpy)
    meshes = sorted([o for o in bpy.data.objects if o.type=='MESH' and
                     any(m.type=='ARMATURE' and m.object==source for m in o.modifiers)], key=lambda o:o.name)
    if not meshes:
        raise RuntimeError('No mesh is bound to the selected armature.')
    parents = {b.name:b.parent.name if b.parent else None for b in source.data.bones}
    moia_layout = (parents == EXPECTED_SOURCE['parents'] and all(
        max(abs(float(a)-b) for a,b in zip(bone.head_local,EXPECTED_SOURCE['heads'][bone.name])) <= .01
        for bone in source.data.bones))
    if CONVERSION_MODE == 'AUTO' and moia_layout:
        # Keeps Moia's reviewed anatomy and the 1.2 cleanup-tolerant validation.
        PRESET_VERSION = 'moia-1.2'
        return main()
    roles = resolve_named_roles(set(parents), HUMANOID_ROLE_BONES)
    # Prefer populated VRM0 or VRM1 roles over aliases, with explicit overrides last.
    ext = getattr(source.data,'vrm_addon_extension',None)
    vrm_roles = {}
    if ext is not None:
        try:
            if ext.spec_version == '0.0':
                vrm_roles = {e.bone:e.node.bone_name for e in ext.vrm0.humanoid.human_bones if e.node.bone_name in parents}
            else:
                values = ext.vrm1.humanoid.human_bones.human_bone_name_to_human_bone()
                vrm_roles = {str(getattr(role,'value',role)):e.node.bone_name for role,e in values.items() if e.node.bone_name in parents}
                for side in ('left','right'):
                    for before,after in (('ThumbProximal','ThumbIntermediate'),('ThumbMetacarpal','ThumbProximal')):
                        if side+before in vrm_roles:
                            vrm_roles[side+after] = vrm_roles.pop(side+before)
        except (AttributeError, TypeError):
            vrm_roles = {}
    roles.update({r:n for r,n in vrm_roles.items() if r in ROLE_TARGETS})
    roles.update(HUMANOID_ROLE_BONES)
    if len(set(roles.values())) != len(roles):
        raise RuntimeError('Duplicate source bones in humanoid map; review HUMANOID_ROLE_BONES.')
    world_heads = {b.name:source.matrix_world@b.head_local for b in source.data.bones}
    world_tails = {b.name:source.matrix_world@b.tail_local for b in source.data.bones}
    missing = [r for r in REQUIRED_ROLES if r not in roles]
    fitted_profile = None
    profile_to_save = None
    if CONVERSION_MODE=='AUTO' and not missing:
        weighted = {g.name for obj in meshes for v in obj.data.vertices for entry in v.groups if entry.weight>0
                    for g in [obj.vertex_groups[entry.group]] if g.name in parents and source.data.bones[g.name].use_deform}
        specs,mapping,humanoid = build_named_profile(parents,roles,weighted)
        up = (world_heads[roles['head']]-world_heads[roles['hips']]).normalized()
        if up.length < .5:
            raise RuntimeError('Head/hips positions do not establish an up direction.')
        left = world_heads[roles['leftUpperArm']]-world_heads[roles['rightUpperArm']]
        left = (left-up*left.dot(up)).normalized()
        if left.length < .5:
            raise RuntimeError('Arm roles do not establish separate left/right sides.')
        forward = left.cross(up).normalized()
        toe_vectors = [world_heads[roles[s+'Toes']]-world_heads[roles[s+'Foot']] for s in ('left','right') if s+'Toes' in roles]
        if toe_vectors:
            foot_direction = sum(toe_vectors,Vector((0,0,0)))
            foot_direction -= up*foot_direction.dot(up)
            if foot_direction.length>1e-6 and foot_direction.normalized().dot(forward)<.2:
                raise RuntimeError('Foot direction conflicts with named left/right roles. Review roles or use GUIDED fitting.')
        tail_landmarks = named_tail_landmarks(roles)
        for spec in specs:
            spec['head'] = tuple(world_heads[spec['source']])
            spec['tail'] = tuple(world_heads[tail_landmarks[spec['source']]] if spec['source'] in tail_landmarks else world_tails[spec['source']])
            spec['tail_landmark'] = 'generic_tail:'+spec['name']
        palms = {}
        for prefix,side in (('left','L'),('right','R')):
            finger_specs = [s for s in specs if s['collection']=='Fingers' and s['name'].endswith('.'+side) and not s['name'].startswith('thumb.')]
            if finger_specs:
                needed = [prefix+r for r in ('Hand','IndexProximal','LittleProximal')]
                if not all(r in roles for r in needed):
                    raise RuntimeError('Finger roles are incomplete for palm orientation; review the role map.')
                wrist,index,pinky = [world_heads[roles[r]] for r in needed]
                normal = (index-wrist).cross(pinky-wrist)
                if side=='L': normal.negate()
                if normal.length<1e-8:
                    raise RuntimeError('Degenerate hand landmarks; review finger roles.')
                palms[side] = tuple(normal.normalized())
        GENERIC_PLAN = {'route':'named_humanoid','profile':'NamedHumanoid','specs':specs,'mapping':mapping,
                        'humanoid':humanoid,'up':tuple(up),'forward':tuple(forward),'palms':palms,
                        'jaw_source':roles.get('jaw'),'explicit_weights':None,
                        'limits':'Weighted extra bones retained in hidden Extras. Aliases/roles and facing need inspection; no clip retargeting.'}
        CREATE_JAW_OPEN_SHAPE = CREATE_JAW_OPEN_SHAPE and 'jaw' in roles
    else:
        points = [tuple(obj.matrix_world@v.co) for obj in meshes for v in obj.data.vertices]
        if CONVERSION_MODE=='AUTO' and REUSE_GUIDED_PROFILES:
            fitted_profile = choose_guided_profile(GUIDED_PROFILE_JSON,
                [(t.name,t.as_string()) for t in bpy.data.texts], parents,
                {b.name:tuple(b.head_local) for b in source.data.bones})
        markers = ({n:tuple(source.matrix_world@Vector(p)) for n,p in profile_landmarks(fitted_profile).items()}
                   if fitted_profile else find_or_create_guides(bpy,source,points))
        if markers is None:
            return
        specs,humanoid,scale = guided_specs(markers)
        rules = dict(fitted_profile['source_region_targets']) if fitted_profile else {}
        rules.update(GUIDED_SOURCE_REGION_TARGETS)
        rules = validate_source_region_targets(rules,parents,specs)
        up = unit(vsub(markers['head'],markers['pelvis']))
        direction = vsub(markers['forward'],markers['chest'])
        forward = unit(tuple(direction[i]-up[i]*sum(a*b for a,b in zip(up,direction)) for i in range(3)))
        left = cross(up,forward)
        for joint in ('shoulder','hip','wrist','ankle'):
            if sum(a*b for a,b in zip(vsub(markers[joint+'.L'],markers[joint+'.R']),left)) <= scale*.01:
                raise RuntimeError(f'{joint} left/right markers conflict with RR_forward. Fix their anatomical sides.')
        explicit_weights = []
        override_vertices = 0
        source_region_vertices = 0
        partial_source_region_vertices = 0
        seam_conflicts = []
        deform_names = {b.name for b in source.data.bones if b.use_deform}
        for obj in meshes:
            names = {g.index:g.name for g in obj.vertex_groups}
            rows = []
            for v in obj.data.vertices:
                override = {names[g.group][3:]:g.weight for g in v.groups if names[g.group].startswith('RR:') and g.weight>0}
                override_vertices += bool(override)
                if not override:
                    skin = {names[g.group]:g.weight for g in v.groups if g.weight>0 and names[g.group] in deform_names}
                    override = source_region_weights(skin,rules)
                    source_region_vertices += bool(override)
                    partial_source_region_vertices += not override and any(n in rules for n in skin)
                rows.append(guided_vertex_weights(tuple(obj.matrix_world@v.co),specs,scale,override))
            explicit_weights.append(rows)
            conflicts = guided_seam_weight_conflicts([tuple(v.co) for v in obj.data.vertices],rows)
            seam_conflicts.append({'mesh':obj.name,'coincident_position_weight_conflicts':conflicts})
            if conflicts:
                print(f'{obj.name}: {conflicts} coincident positions receive different guided weights. Inspect seams/overrides; separate overlapping layers can also be intentional.')
        # Source groups will be removed, but guided rows independently target all body bones.
        mapping = {name:'root' for name in parents}
        GENERIC_PLAN = {'route':'guided_reconstruction_draft','profile':'GuidedBody22','specs':specs,'mapping':mapping,
                        'humanoid':humanoid,'up':up,'forward':forward,'palms':{},'jaw_source':None,
                        'explicit_weights':explicit_weights,'region_override_vertices':override_vertices,
                        'source_region_vertices':source_region_vertices,'partial_source_region_vertices':partial_source_region_vertices,
                        'source_region_targets':rules,'guided_profile_reused':bool(fitted_profile),
                        'guided_seam_checks':seam_conflicts,
                        'guided_profile_name':fitted_profile.get('name') if fitted_profile else None,
                        'limits':'Geometry-distance body weights are approximate; test and correct bends. Rigid hands; no jaw/facial shapes. Not a verified animation-ready result.'}
        inverse = source.matrix_world.inverted()
        profile_to_save = make_guided_profile(source.name,parents,
            {b.name:tuple(b.head_local) for b in source.data.bones},
            {n:tuple(inverse@Vector(p)) for n,p in markers.items()},rules)
        CREATE_JAW_OPEN_SHAPE = False
    EXPECTED_SOURCE = {'parents':parents,'heads':{b.name:tuple(b.head_local) for b in source.data.bones},
                       'mesh_counts':[len(meshes[0].data.vertices),len(meshes[0].data.edges),len(meshes[0].data.polygons)],
                       'mesh_signature':None}
    PRESET_VERSION = UNIVERSAL_VERSION
    build_profile = lambda parents,keep_fingers: (GENERIC_PLAN['specs'],GENERIC_PLAN['mapping'])
    palm_normal = lambda heads,side: GENERIC_PLAN['palms'][side]
    vrm0_humanoid_mapping = lambda keep_fingers: GENERIC_PLAN['humanoid']
    result = main()
    if GENERIC_PLAN['route']=='guided_reconstruction_draft':
        try:
            save_guided_profile_text(bpy,source,profile_to_save)
        except Exception as error:
            # Conversion already succeeded; a profile storage problem does not invalidate it.
            print('Rig conversion succeeded, but reusable profile storage failed:',error)
        for collection in bpy.data.collections:
            if collection.get('rune_rig_guide_source')==source.name:
                collection.hide_viewport = True
    return result


if __name__ == "__main__":
    universal_main()
