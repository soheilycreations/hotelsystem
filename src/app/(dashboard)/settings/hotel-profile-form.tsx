"use client";

import { useState, useTransition } from "react";
import { Building2, ImagePlus, QrCode, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { HotelSettings } from "@/lib/types";
import { updateHotelSettings } from "./actions";

async function uploadHotelAsset(file: File): Promise<string> {
  const supabase = createClient();
  const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from("hotel-assets").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("hotel-assets").getPublicUrl(path);
  return data.publicUrl;
}

export function HotelProfileForm({ settings }: { settings: HotelSettings | null }) {
  const [name, setName] = useState(settings?.hotel_name ?? "Soheily PMS");
  const [address, setAddress] = useState(settings?.address ?? "");
  const [phone1, setPhone1] = useState(settings?.phone_primary ?? "");
  const [phone2, setPhone2] = useState(settings?.phone_secondary ?? "");
  const [logoUrl, setLogoUrl] = useState(settings?.logo_url ?? "");
  const [reviewQrUrl, setReviewQrUrl] = useState(settings?.review_qr_url ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [scRate, setScRate] = useState(String(settings?.service_charge_rate ?? 10));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setMessage(null);
    try {
      setLogoUrl(await uploadHotelAsset(file));
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not upload the logo." });
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleQrChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQr(true);
    setMessage(null);
    try {
      setReviewQrUrl(await uploadHotelAsset(file));
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not upload the QR code." });
    } finally {
      setUploadingQr(false);
    }
  }

  function submit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const res = await updateHotelSettings(formData);
      setMessage(
        res.ok
          ? { ok: true, text: "Hotel profile saved — bills and headers update immediately." }
          : { ok: false, text: res.error ?? "Could not save." }
      );
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Property details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={submit} className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="hp-name">Hotel name</Label>
              <Input
                id="hp-name"
                name="hotel_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Nobel Regency Hotel"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hp-address">Address</Label>
              <Textarea
                id="hp-address"
                name="address"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 123 Main Street, Bibile"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hp-phone1">Contact number 1</Label>
                <Input
                  id="hp-phone1"
                  name="phone_primary"
                  type="tel"
                  value={phone1}
                  onChange={(e) => setPhone1(e.target.value)}
                  placeholder="0XX XXX XXXX"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hp-phone2">Contact number 2</Label>
                <Input
                  id="hp-phone2"
                  name="phone_secondary"
                  type="tel"
                  value={phone2}
                  onChange={(e) => setPhone2(e.target.value)}
                  placeholder="07X XXX XXXX"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hp-sc">Service charge on POS sales (%)</Label>
              <Input
                id="hp-sc"
                name="service_charge_rate"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={scRate}
                onChange={(e) => setScRate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Added on top of every restaurant/POS bill and shown as its own line. Set 0 to
                switch it off. Open bills recalculate on their next item change; already-settled
                bills never change.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hp-logo">Logo</Label>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-16 w-16 rounded-md border object-contain p-1" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-md bg-muted">
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  </span>
                )}
                <div className="flex-1">
                  <input
                    id="hp-logo"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    disabled={uploadingLogo}
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-secondary-foreground"
                  />
                  {uploadingLogo && <p className="mt-1 text-xs text-muted-foreground">Uploading…</p>}
                </div>
              </div>
              <input type="hidden" name="logo_url" value={logoUrl} />
              <p className="text-xs text-muted-foreground">
                Shown in the app header. Thermal bills print the name and details as text —
                clone printers handle logo images unreliably.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hp-qr">Google review QR code</Label>
              <div className="flex items-center gap-3">
                {reviewQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={reviewQrUrl}
                    alt=""
                    className="h-16 w-16 rounded-md border bg-white object-contain p-1"
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-md bg-muted">
                    <QrCode className="h-5 w-5 text-muted-foreground" />
                  </span>
                )}
                <div className="flex-1">
                  <input
                    id="hp-qr"
                    type="file"
                    accept="image/*"
                    onChange={handleQrChange}
                    disabled={uploadingQr}
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-secondary-foreground"
                  />
                  {uploadingQr && <p className="mt-1 text-xs text-muted-foreground">Uploading…</p>}
                </div>
              </div>
              <input type="hidden" name="review_qr_url" value={reviewQrUrl} />
              <p className="text-xs text-muted-foreground">
                Printed at the bottom of every bill (restaurant bills and room folios) with a
                &quot;Scan to leave us a review&quot; note — both the thermal print and the PDF/WhatsApp
                copy.
              </p>
            </div>
            {message ? (
              <p className={`text-sm ${message.ok ? "text-emerald-500" : "text-destructive"}`}>
                {message.text}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              <Save className="mr-2 h-4 w-4" />
              {pending ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Bill header preview */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Bill header preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-muted/30 p-4 text-center font-mono text-xs">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Hotel logo"
                className="mx-auto mb-2 h-12 w-12 rounded object-contain"
              />
            ) : null}
            <p className="text-base font-bold">{name || "HOTEL NAME"}</p>
            {address ? <p className="mt-1 whitespace-pre-line">{address}</p> : null}
            {phone1 || phone2 ? (
              <p className="mt-0.5">Tel: {[phone1, phone2].filter(Boolean).join(" / ")}</p>
            ) : null}
            <p className="mt-2 border-t border-dashed pt-2 text-muted-foreground">
              GUEST FOLIO / ROOM BILL
            </p>
            {reviewQrUrl && (
              <div className="mt-3 border-t border-dashed pt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={reviewQrUrl} alt="" className="mx-auto h-16 w-16 bg-white object-contain" />
                <p className="mt-1 text-muted-foreground">Scan to leave us a review!</p>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            This header prints on room bills and restaurant receipts, and the QR (if set) prints
            at the bottom. The logo shows in the app sidebar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
