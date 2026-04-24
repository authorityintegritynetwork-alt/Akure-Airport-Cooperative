import { useState } from "react";
import {
  useListStoreItems,
  useCreateStoreItem,
  useUpdateStoreItem,
  useDeleteStoreItem,
  getListStoreItemsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle, Edit, Trash2, Upload, ShoppingCart } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const storeItemSchema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  price: z.number({ error: "Price required" }).positive(),
  quantityAvailable: z.number().int().min(0).default(0),
});
type StoreItemForm = z.infer<typeof storeItemSchema>;

export function StoreAdminPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: items, isLoading } = useListStoreItems({});
  const createItem = useCreateStoreItem();
  const updateItem = useUpdateStoreItem();
  const deleteItem = useDeleteStoreItem();

  const form = useForm<StoreItemForm>({
    resolver: zodResolver(storeItemSchema),
    defaultValues: { name: "", description: "", price: 0, quantityAvailable: 0 },
  });

  function openCreate() {
    setEditItem(null);
    setUploadedImagePath(null);
    setImageFile(null);
    form.reset({ name: "", description: "", price: 0, quantityAvailable: 0 });
    setDialogOpen(true);
  }

  function openEdit(item: any) {
    setEditItem(item);
    setUploadedImagePath(item.imageObjectPath || null);
    setImageFile(null);
    form.reset({ name: item.name, description: item.description || "", price: item.price, quantityAvailable: item.quantityAvailable });
    setDialogOpen(true);
  }

  async function handleImageUpload() {
    if (!imageFile) return;
    setImageUploading(true);
    try {
      const urlResp = await fetch(`${basePath}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: imageFile.name, size: imageFile.size, contentType: imageFile.type }),
      });
      if (!urlResp.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlResp.json();

      const uploadResp = await fetch(uploadURL, { method: "PUT", body: imageFile, headers: { "Content-Type": imageFile.type } });
      if (!uploadResp.ok) throw new Error("Image upload failed");

      setUploadedImagePath(objectPath);
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
  }

  function onSubmit(data: StoreItemForm) {
    const payload = {
      name: data.name,
      description: data.description || undefined,
      price: data.price,
      quantityAvailable: data.quantityAvailable,
      imageObjectPath: uploadedImagePath || undefined,
    };

    const opts = {
      onSuccess: () => {
        toast({ title: editItem ? "Item updated" : "Item created" });
        queryClient.invalidateQueries({ queryKey: getListStoreItemsQueryKey({}) });
        setDialogOpen(false);
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    };

    if (editItem) {
      updateItem.mutate({ id: editItem.id, data: payload }, opts);
    } else {
      createItem.mutate({ data: payload }, opts);
    }
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this item?")) return;
    deleteItem.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Item deleted" });
          queryClient.invalidateQueries({ queryKey: getListStoreItemsQueryKey({}) });
        },
      },
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero gradient card with embedded Add button */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-primary/20"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220 80% 35%) 45%, hsl(200 85% 45%) 100%)",
        }}
        data-testid="store-admin-hero"
      >
        <div className="absolute -top-12 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-white/80 font-medium uppercase tracking-wider">
              Cooperative Store
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold mt-0.5 tabular-nums">
              {items?.length ?? 0}
            </h1>
            <p className="text-xs text-white/80 mt-1">Items in catalog</p>
          </div>
          <Button
            onClick={openCreate}
            size="sm"
            className="rounded-full bg-white text-primary hover:bg-white/90 shrink-0 font-semibold shadow-lg"
            data-testid="button-create-store-item"
          >
            <PlusCircle className="w-4 h-4 mr-1.5" />
            Add Item
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
        </div>
      ) : !items || items.length === 0 ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="text-center py-16 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No store items yet.</p>
            <p className="text-sm mt-1">Add your first item to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
          {items.map((item: any) => (
            <Card
              key={item.id}
              data-testid={`store-admin-item-${item.id}`}
              className="overflow-hidden rounded-2xl shadow-sm border-border/70 flex flex-col"
            >
              {item.imageObjectPath ? (
                <img
                  src={`${basePath}/api/storage/objects${item.imageObjectPath}`}
                  alt={item.name}
                  className="w-full aspect-square object-cover"
                />
              ) : (
                <div className="w-full aspect-square bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                  <ShoppingCart className="w-10 h-10 text-muted-foreground/30" />
                </div>
              )}
              <CardContent className="p-3 space-y-2 flex-1 flex flex-col">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{item.name}</p>
                  <p className="text-base font-bold text-primary tabular-nums mt-0.5">
                    {formatCurrency(item.price)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge
                    variant="outline"
                    className={`rounded-full text-[10px] ${
                      item.isAvailable
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.isAvailable ? "Available" : "Hidden"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    Qty: <span className="font-semibold text-foreground">{item.quantityAvailable}</span>
                  </span>
                </div>
                <div className="flex gap-1.5 mt-auto pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-lg h-8 text-xs"
                    onClick={() => openEdit(item)}
                    data-testid={`button-edit-item-${item.id}`}
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-lg h-8 px-2"
                    onClick={() => handleDelete(item.id)}
                    data-testid={`button-delete-item-${item.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Store Item" : "Add Store Item"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input className="rounded-xl" data-testid="input-item-name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl><Input className="rounded-xl" data-testid="input-item-description" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (₦)</FormLabel>
                    <FormControl>
                      <Input type="number" className="rounded-xl" data-testid="input-item-price" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="quantityAvailable" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" className="rounded-xl" data-testid="input-item-quantity" {...field} onChange={(e) => field.onChange(parseInt(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Product Image (optional)</label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    className="rounded-xl file:bg-primary/10 file:text-primary file:border-0 file:rounded-lg file:px-3 file:py-1.5 file:mr-3 file:font-semibold cursor-pointer"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                    data-testid="input-item-image"
                  />
                  <Button type="button" variant="outline" size="sm" className="rounded-xl shrink-0" onClick={handleImageUpload} disabled={!imageFile || imageUploading} data-testid="button-upload-image">
                    <Upload className="w-4 h-4" />
                  </Button>
                </div>
                {uploadedImagePath && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-500/10 rounded-xl p-2">
                    <img src={`${basePath}/api/storage/objects${uploadedImagePath}`} alt="" className="w-10 h-10 object-cover rounded-lg" />
                    <span className="font-semibold">Image uploaded</span>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full rounded-xl h-11" disabled={createItem.isPending || updateItem.isPending} data-testid="button-submit-store-item">
                {editItem ? "Update Item" : "Create Item"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
