/* Surge XT Knobs: control ports -> MIDI CC, so the pi-Stomp display and knobs can edit Surge XT.
 * Connect the MIDI output to the MIDI input of Surge XT. Only changes are sent (a knob that is
 * restored when a pedalboard loads does not overwrite the patch). */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "lv2/core/lv2.h"
#include "lv2/atom/atom.h"
#include "lv2/midi/midi.h"
#include "lv2/urid/urid.h"
#include "knobs.h"

typedef struct {
    const float *ctl[N_KNOBS];
    LV2_Atom_Sequence *out;
    LV2_URID urid_seq, urid_midi;
    int last[N_KNOBS];
    int primed;
} Knobs;

static LV2_Handle instantiate(const LV2_Descriptor *d, double rate, const char *path, const LV2_Feature *const *features)
{
    (void)d; (void)rate; (void)path;
    LV2_URID_Map *map = NULL;
    for (int i = 0; features && features[i]; ++i)
        if (!strcmp(features[i]->URI, LV2_URID__map))
            map = (LV2_URID_Map *)features[i]->data;
    if (!map)
        return NULL;
    Knobs *k = (Knobs *)calloc(1, sizeof(Knobs));
    k->urid_seq = map->map(map->handle, LV2_ATOM__Sequence);
    k->urid_midi = map->map(map->handle, LV2_MIDI__MidiEvent);
    return (LV2_Handle)k;
}

static void connect_port(LV2_Handle h, uint32_t port, void *data)
{
    Knobs *k = (Knobs *)h;
    if (port < N_KNOBS)
        k->ctl[port] = (const float *)data;
    else if (port == N_KNOBS)
        k->out = (LV2_Atom_Sequence *)data;
}

static void run(LV2_Handle h, uint32_t n)
{
    (void)n;
    Knobs *k = (Knobs *)h;
    if (!k->out)
        return;
    const uint32_t capacity = k->out->atom.size;
    k->out->atom.type = k->urid_seq;
    k->out->atom.size = sizeof(LV2_Atom_Sequence_Body);
    k->out->body.unit = 0;
    k->out->body.pad = 0;

    for (int i = 0; i < N_KNOBS; ++i)
    {
        if (!k->ctl[i])
            continue;
        float v = *k->ctl[i];
        if (v < 0.f) v = 0.f;
        if (v > 1.f) v = 1.f;
        int q = (int)lroundf(v * 127.f);
        if (!k->primed) { k->last[i] = q; continue; }
        if (q == k->last[i])
            continue;
        const uint32_t ev_size = (uint32_t)((sizeof(LV2_Atom_Event) + 3 + 7) & ~7u);
        if (k->out->atom.size + ev_size > capacity)
            break; /* no room left; this knob is sent in the next cycle (last[] is not updated) */
        uint8_t *base = (uint8_t *)k->out + sizeof(LV2_Atom) + k->out->atom.size;
        LV2_Atom_Event *ev = (LV2_Atom_Event *)base;
        ev->time.frames = 0;
        ev->body.type = k->urid_midi;
        ev->body.size = 3;
        uint8_t *msg = (uint8_t *)(ev + 1);
        msg[0] = 0xB0; /* control change, channel 1 */
        msg[1] = knob_cc[i];
        msg[2] = (uint8_t)q;
        k->out->atom.size += ev_size;
        k->last[i] = q;
    }
    k->primed = 1;
}

static void noop(LV2_Handle h) { (void)h; }
static void cleanup(LV2_Handle h) { free(h); }
static const void *ext(const char *uri) { (void)uri; return NULL; }

static const LV2_Descriptor desc = {"https://github.com/maarthome/surge/lv2/surge-xt-knobs",
                                    instantiate, connect_port, noop, run, noop, cleanup, ext};

LV2_SYMBOL_EXPORT const LV2_Descriptor *lv2_descriptor(uint32_t i) { return i == 0 ? &desc : NULL; }
