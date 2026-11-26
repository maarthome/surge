#!/usr/bin/env python3
"""Generate the bundle files of "Surge XT Knobs" from one table.

usage: gen-knobs.py <output dir>   (writes manifest.ttl, surge_xt_knobs.ttl, knobs.h)

The same CC numbers are mapped to the Surge parameters in
SurgeSynthProcessor::syncLoop() (defaultKnobMap) - keep the two in sync.
"""
import os, sys

URI = "https://github.com/maarthome/surge/lv2/surge-xt-knobs"
# symbol, name, midi cc, default (0..1); Amp Gain is -48..+48 dB, 0.5 = 0 dB
KNOBS = [
    ("cutoff", "Cutoff", 20, 0.5), ("reso", "Resonance", 21, 0.0), ("envamt", "Filter Env Amt", 22, 0.5),
    ("a_att", "Amp Attack", 23, 0.0), ("a_dec", "Amp Decay", 24, 0.5), ("a_sus", "Amp Sustain", 25, 1.0), ("a_rel", "Amp Release", 26, 0.3), ("a_gain", "Amp Gain", 36, 0.5),
    ("f_att", "Filter Attack", 27, 0.0), ("f_dec", "Filter Decay", 28, 0.5), ("f_sus", "Filter Sustain", 29, 0.0), ("f_rel", "Filter Release", 30, 0.3),
    ("osc1", "Osc 1 Level", 31, 0.8), ("osc2", "Osc 2 Level", 32, 0.0), ("osc3", "Osc 3 Level", 33, 0.0),
    ("level", "Scene Level", 34, 0.8), ("master", "Master Volume", 35, 0.8),
] + [("macro%d" % (i + 1), "Macro %d" % (i + 1), 41 + i, 0.0) for i in range(8)] + [
    # the rest of the continuous controls of the MOD panel (CC 52-63, 70-81)
    ("pitch", "Pitch", 52, 0.5), ("porta", "Portamento", 53, 0.0), ("bend_dn", "Bend Down", 54, 0.08), ("bend_up", "Bend Up", 55, 0.08),
    ("drift", "Osc Drift", 56, 0.0), ("noisecol", "Noise Color", 57, 0.5),
    ("cutoff2", "Filter 2 Cutoff", 58, 0.5), ("reso2", "Filter 2 Resonance", 59, 0.0), ("envamt2", "Filter 2 Env Amt", 60, 0.5),
    ("ktrk1", "Filter 1 Keytrack", 61, 0.5), ("ktrk2", "Filter 2 Keytrack", 62, 0.5), ("fbal", "Filter Balance", 63, 0.5),
    ("hp", "Highpass", 70, 0.0), ("wsdrive", "Waveshaper Drive", 71, 0.5),
    ("ring12", "Ring 1x2 Level", 72, 0.0), ("ring23", "Ring 2x3 Level", 73, 0.0), ("noise", "Noise Level", 74, 0.0), ("pfg", "Mixer Gain", 75, 0.5),
    ("vel", "Amp Velocity", 76, 1.0), ("pan", "Pan", 77, 0.5), ("width", "Width", 78, 0.5), ("fx1", "FX 1 Send", 79, 0.0), ("fx2", "FX 2 Send", 80, 0.0),
]


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    n = len(KNOBS)
    with open(os.path.join(out, "manifest.ttl"), "w") as f:
        f.write("@prefix lv2:  <http://lv2plug.in/ns/lv2core#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n\n"
                "<%s>\n    a lv2:Plugin ;\n    lv2:binary <surge_xt_knobs.so> ;\n    rdfs:seeAlso <surge_xt_knobs.ttl> .\n" % URI)
    ports = []
    for i, (sym, name, cc, dflt) in enumerate(KNOBS):
        ports.append("""    [
        a lv2:InputPort , lv2:ControlPort ;
        lv2:index %d ;
        lv2:symbol "%s" ;
        lv2:name "%s" ;
        lv2:default %.2f ;
        lv2:minimum 0.0 ;
        lv2:maximum 1.0 ;
    ]""" % (i, sym, name, dflt))
    ports.append("""    [
        a lv2:OutputPort , atom:AtomPort ;
        atom:bufferType atom:Sequence ;
        atom:supports midi:MidiEvent ;
        lv2:index %d ;
        lv2:symbol "midi_out" ;
        lv2:name "MIDI Out" ;
    ]""" % n)
    with open(os.path.join(out, "surge_xt_knobs.ttl"), "w") as f:
        f.write("""@prefix lv2:  <http://lv2plug.in/ns/lv2core#> .
@prefix atom: <http://lv2plug.in/ns/ext/atom#> .
@prefix midi: <http://lv2plug.in/ns/ext/midi#> .
@prefix doap: <http://usefulinc.com/ns/doap#> .
@prefix urid: <http://lv2plug.in/ns/ext/urid#> .

<%s>
    a lv2:Plugin , lv2:UtilityPlugin ;
    doap:name "Surge XT Knobs" ;
    doap:license <http://opensource.org/licenses/isc> ;
    lv2:optionalFeature lv2:hardRTCapable ;
    lv2:requiredFeature urid:map ;
    lv2:port
%s .
""" % (URI, " ,\n".join(ports)))
    with open(os.path.join(out, "knobs.h"), "w") as f:
        f.write("#define N_KNOBS %d\nstatic const unsigned char knob_cc[N_KNOBS] = {%s};\n" % (n, ",".join(str(k[2]) for k in KNOBS)))
    print("wrote %d knobs to %s" % (n, out))


if __name__ == "__main__":
    main()
