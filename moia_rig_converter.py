"""Moia rig converter, built from the supplied 193-bone diagnostic.

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
PRESET_VERSION = "moia-1.0"
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
    specs = [{"source": f"bone_{index}", "name": name,
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


def verify_source(source, meshes):
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
    if len(meshes) != 1:
        raise RuntimeError("This validated Moia preset expects one bound mesh object.")
    obj = meshes[0]
    counts = [len(obj.data.vertices), len(obj.data.edges), len(obj.data.polygons)]
    if counts != expected["mesh_counts"]:
        raise RuntimeError(f"Moia mesh topology counts differ: {counts}; conversion stopped.")
    # Check both geometry and skinning, not just vertex count. Editing source
    # weights should require reviewing the preset again rather than guessing.
    names = {g.index: g.name for g in obj.vertex_groups}
    signature = mesh_signature(
        [tuple(v.co) for v in obj.data.vertices],
        [tuple(p.vertices) for p in obj.data.polygons],
        [tuple(e.vertices) for e in obj.data.edges],
        [[(g.group, g.weight) for g in v.groups] for v in obj.data.vertices], names)
    if signature != expected["mesh_signature"]:
        raise RuntimeError("Source mesh geometry or skinning differs from the supplied Moia dump; conversion stopped.")
    if obj.data.shape_keys:
        raise RuntimeError("This source now has shape keys; their bind geometry needs separate handling.")
    if obj.constraints or obj.animation_data:
        raise RuntimeError("This source mesh now has constraints or animation; review those dependencies first.")
    active_modifiers = [m for m in obj.modifiers if m.show_viewport or m.show_render]
    if len(obj.modifiers) != 1 or len(active_modifiers) != 1 or active_modifiers[0].type != "ARMATURE":
        raise RuntimeError("This preset expects the original single Armature modifier.")
    modifier = active_modifiers[0]
    if modifier.use_bone_envelopes or not modifier.use_vertex_groups:
        raise RuntimeError("This preset requires vertex-group skinning without bone envelopes.")
    if modifier.use_deform_preserve_volume or modifier.vertex_group:
        raise RuntimeError("This preset expects the original LBS modifier without a vertex-group mask.")
    extra_weights = {names[g.group] for v in obj.data.vertices for g in v.groups
                     if names[g.group] not in expected["parents"] and g.weight > 0}
    if extra_weights:
        raise RuntimeError(f"Unexpected weighted non-bone groups: {sorted(extra_weights)}")


def source_armature(bpy):
    active = bpy.context.view_layer.objects.active
    if active and active.type == "ARMATURE":
        return active
    if active and active.type == "MESH":
        targets = {m.object for m in active.modifiers if m.type == "ARMATURE" and m.object}
        if len(targets) == 1:
            return targets.pop()
    raise RuntimeError("Select the ORIGINAL imported Moia armature in Object Mode.")


def main():
    import bpy
    from mathutils import Matrix, Vector

    if bpy.context.mode != "OBJECT":
        raise RuntimeError("Switch to Object Mode and select the original Moia armature.")
    source = source_armature(bpy)
    meshes = sorted([o for o in bpy.data.objects if o.type == "MESH" and
                     any(m.type == "ARMATURE" and m.object == source for m in o.modifiers)],
                    key=lambda o: o.name)
    verify_source(source, meshes)
    parents = {b.name: b.parent.name if b.parent else None for b in source.data.bones}
    specs, mapping = build_profile(parents, KEEP_FINGERS)
    heads = {b.name: source.matrix_world @ b.head_local for b in source.data.bones}
    offset = Vector(OUTPUT_OFFSET)
    if len(offset) != 3 or not all(math.isfinite(float(x)) for x in offset):
        raise RuntimeError("OUTPUT_OFFSET must contain three finite numbers.")
    profile = "Fingers70" if KEEP_FINGERS else "Compact40"
    selected_before = list(bpy.context.selected_objects)
    active_before = bpy.context.view_layer.objects.active
    source_visibility = [(obj, obj.hide_get(), obj.hide_render) for obj in [source] + meshes]
    collection = None
    created_objects, created_data, created_texts = [], [], []
    try:
        collection = bpy.data.collections.new(f"Moia_{profile}")
        bpy.context.scene.collection.children.link(collection)
        armature_data = bpy.data.armatures.new(f"Moia_{profile}_Skeleton")
        created_data.append(("armature", armature_data))
        rig = bpy.data.objects.new(f"Moia_{profile}_Rig", armature_data)
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
            roll_axis = Vector((0, 1, 0))
            if abs((bone.tail - bone.head).normalized().dot(roll_axis)) > 0.95:
                roll_axis = Vector((0, 0, 1))
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
        rig["weight_mapping_json"] = json.dumps(mapping, separators=(",", ":"))
        checks = []
        for original in meshes:
            new_mesh = original.data.copy()
            created_data.append(("mesh", new_mesh))
            obj = original.copy()
            created_objects.append(obj)
            obj.data = new_mesh
            obj.name = f"Moia_{profile}_Mesh"
            collection.objects.link(obj)
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
            transform = original.matrix_world.copy()
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
            expected_world = [(original.matrix_world @ vertex.co) + offset
                              for vertex in original.data.vertices]
            group_names = {g.index: g.name for g in original.vertex_groups}
            remapped = [remap_vertex_weights([(g.group, g.weight) for g in v.groups], group_names, mapping)[0]
                        for v in original.data.vertices]
            existing = set(g.name for g in obj.vertex_groups)
            for name in set(mapping.values()):
                if name in existing and name not in mapping:
                    raise RuntimeError(f"Destination group collision: {name}")
            for group in list(obj.vertex_groups):
                if group.name in mapping:
                    obj.vertex_groups.remove(group)
            targets = {name: obj.vertex_groups.new(name=name) for name in sorted(set(mapping.values()))}
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
            checks.append({"mesh": obj.name, "vertex_count": len(new_mesh.vertices),
                           "max_weight_sum_error": maximum_sum_error,
                           "max_rest_world_error": maximum_rest_error})
        validation = {"preset": PRESET_VERSION, "profile": profile,
                      "source_bones": len(source.data.bones), "result_bones": len(specs),
                      "checks": checks,
                      "limits": "Rest mesh and stored weights verified. New joint bends and shading need visual inspection. No IK, finger-curl drivers, or original clips are transferred."}
        rig["conversion_validation_json"] = json.dumps(validation)
        text = bpy.data.texts.new(f"Moia_{profile}_ConversionReport.txt")
        created_texts.append(text)
        text.write(json.dumps(validation, indent=2) + "\n\nSOURCE BONE -> DESTINATION\n" +
                   "\n".join(f"{name} -> {mapping[name]}" for name in sorted(mapping, key=lambda n: int(n.split('_')[1]))))
        if HIDE_SOURCE_AFTER_SUCCESS:
            for original in [source] + meshes:
                original.hide_set(True)
                original.hide_render = True
        bpy.ops.object.mode_set(mode="POSE")
        print(json.dumps(validation, indent=2))
        def draw_popup(self, context):
            self.layout.label(text=f"Created {len(specs)}-bone Moia rig in {collection.name}")
            self.layout.label(text="Rest shape and vertex weights verified.")
            self.layout.label(text="Pose the new rig; inspect elbows, wrists, knees, and cloth.")
            self.layout.label(text="Original remains intact, hidden in viewport/render.")
        try:
            bpy.context.window_manager.popup_menu(draw_popup, title="Moia conversion complete", icon="INFO")
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


if __name__ == "__main__":
    main()
