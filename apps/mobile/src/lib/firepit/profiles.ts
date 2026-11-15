import { authHeaders, firepitRequest } from "@/lib/firepit/http";

export type UpdateProfileInput = {
    displayName?: string;
    bio?: string;
    pronouns?: string;
    location?: string;
    website?: string;
    profileBackgroundColor?: string | null;
    profileBackgroundGradient?: string | null;
};

export type UpdateProfileResponse = {
    userId?: string;
    displayName?: string;
    userName?: string;
    bio?: string;
    pronouns?: string;
    location?: string;
    website?: string;
    avatarFileId?: string;
    avatarUrl?: string;
};

export type AvatarUploadResponse = {
    fileId: string;
    avatarUrl: string;
};

export type BackgroundUploadResponse = {
    fileId: string;
    backgroundUrl: string;
};

export async function updateProfile(
    baseUrl: string,
    token: string,
    data: UpdateProfileInput,
) {
    return firepitRequest<UpdateProfileResponse>({
        baseUrl,
        path: "/api/profile",
        method: "PATCH",
        token,
        body: data,
    });
}

// React Native's FormData takes a file part as `{ uri, name, type }` and streams
// it natively. The base64/`bytes` shape this used to build on the happy path is
// a browser Blob shim: RN's networking layer looks for `string`, `base64`,
// `uri` or `formData` and finds none of them, so it sent the part with a
// filename and zero content bytes, which the server rejects with
// "No file provided". Avatar and background uploads always failed on native.
function fileToFormDataPart(uri: string, name: string, mimeType: string) {
    return { uri, name, type: mimeType } as unknown as Blob;
}

const UPLOAD_TIMEOUT_MS = 30_000;

async function postFormData<T>(
    baseUrl: string,
    path: string,
    token: string,
    formData: FormData,
    failureLabel: string,
): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
            method: "POST",
            headers: authHeaders(token),
            body: formData,
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`${failureLabel} failed (${response.status})`);
        }
        return response.json() as Promise<T>;
    } finally {
        clearTimeout(timer);
    }
}

export async function uploadAvatar(
    baseUrl: string,
    token: string,
    imageUri: string,
): Promise<AvatarUploadResponse> {
    const formData = new FormData();
    formData.append(
        "avatar",
        await fileToFormDataPart(imageUri, "avatar.jpg", "image/jpeg"),
    );

    return postFormData<AvatarUploadResponse>(
        baseUrl,
        "/api/profile/avatar",
        token,
        formData,
        "Avatar upload",
    );
}

export async function removeAvatar(baseUrl: string, token: string) {
    return firepitRequest<{ success: boolean }>({
        baseUrl,
        path: "/api/profile/avatar",
        method: "DELETE",
        token,
    });
}

export async function uploadProfileBackground(
    baseUrl: string,
    token: string,
    imageUri: string,
): Promise<BackgroundUploadResponse> {
    const formData = new FormData();
    formData.append(
        "background",
        await fileToFormDataPart(imageUri, "background.jpg", "image/jpeg"),
    );

    return postFormData<BackgroundUploadResponse>(
        baseUrl,
        "/api/profile/background",
        token,
        formData,
        "Background upload",
    );
}
