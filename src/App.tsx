import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, CheckCircle2, XCircle, PlayCircle } from "lucide-react";
import { Card, CardContent } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";
import { TokenResponse, useGoogleLogin } from "@react-oauth/google";
import axios from "axios";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";

interface Contact {
  id: number;
  name: string;
  label: string;
  cpf: string;
  phone: string;
  convenio: string;
  status: "waiting button click" | "uploading" | "completed" | "error";
  progress: number;
}

interface IOAuthResponse {
  access_token: string;
  authuser: string;
}

const access_password = "xg25PD9A7Na0ZqC0YFMo";

function App(): JSX.Element {
  const [token, setToken] = useState<IOAuthResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [group, setGroup] = useState<
    | {
        resourceName: string;
        etag: string;
        metada: string;
        groupType: string;
        name: string;
        formattedName: string;
      }[]
    | null
  >(null);
  const [password, setPassword] = useState<string>("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setFile(file);

      const reader = new FileReader();
      reader.onload = (e): void => {
        if (e.target && e.target.result) {
          const data = new Uint8Array(e.target.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          processWorkbook(workbook);
        }
      };
      reader.onloadend = async (): Promise<void> => {};
      reader.readAsArrayBuffer(file);
    }
  }, []);

  function processWorkbook(workbook: XLSX.WorkBook): void {
    // Obtém o nome da primeira aba
    const contacts = [] as Contact[];

    for (const sheetName in workbook.Sheets) {
      const sheet = workbook.Sheets[sheetName];

      const data = XLSX.utils.sheet_to_json(sheet) as unknown as {
        NOME: string;
        CPF: string;
        TIPO: string;
        NÚMERO: string;
      }[]; // `header: 1` retorna matriz; sem ele, retorna objetos

      contacts.push(
        ...data
          .map(
            (contact, index) =>
              ({
                id: index,
                name: `${contact.NOME} ${contact.CPF} ${contact.TIPO}`,
                label: contact.TIPO,
                cpf: contact.CPF,
                convenio: contact.TIPO,
                phone: contact.NÚMERO.split("|")[0].trim(),
                status: "waiting button click",
                progress: 0,
              } as Contact)
          )
          .filter(
            (contact) =>
              contact.phone !== "SEM CONTATO" &&
              contact.phone !== "OLHAR CSG" &&
              contact.phone !== "" &&
              contact.phone.trim() !== ""
          )
      );
    }

    setContacts(() => contacts);
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: false,
  });

  const simulateContactUpload = async (): Promise<void> => {
    for (const contact of contacts) {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contact.id ? { ...c, status: "uploading" } : c
        )
      );

      try {
        console.log("Enviando contato", contact.name, contact.phone);
        const groupId =
          group?.find((g) => g.name === contact.label)?.resourceName ?? "";

        const groupToAdd = groupId
          ? [{ contactGroupMembership: { contactGroupResourceName: groupId } }]
          : [];

        await axios.post(
          "https://people.googleapis.com/v1/people:createContact",
          {
            names: [{ givenName: contact.name }],
            phoneNumbers: [{ value: contact.phone }],
            memberships: groupToAdd,
            userDefined: [
              {
                key: "CPF",
                value: contact.cpf.toString(),
              },
              {
                key: "Convenio",
                value: contact.convenio.toString(),
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${token?.access_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        setContacts((prev) =>
          prev.map((c) =>
            c.id === contact.id ? { ...c, status: "completed" } : c
          )
        );
      } catch (ex) {
        console.log("Erro ao enviar contato", contact.name, contact.phone, ex);
        setContacts((prev) =>
          prev.map((c) => (c.id === contact.id ? { ...c, status: "error" } : c))
        );
      }

      setOverallProgress((prev) => Math.min(prev + 100 / contacts.length, 100));
    }
  };

  const handleUpload = async (): Promise<void> => {
    if (!file) return;

    setUploading(true);
    setOverallProgress(0);
    setMessage("Enviando arquivo...");

    try {
      setMessage("Arquivo enviado. Processando contatos...");

      await simulateContactUpload();

      setMessage("Todos os contatos foram processados.");
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      setMessage("Erro ao enviar o arquivo. Por favor, tente novamente.");
    } finally {
      setUploading(false);
    }
  };

  const handleLoginSuccess = (
    response: Omit<TokenResponse, "error" | "error_description" | "error_uri">
  ): void => {
    setToken(response as unknown as IOAuthResponse);
    console.log("Login bem-sucedido:", response);
  };

  const handleLoginFailure = (): void => {
    console.error("Erro ao autenticar:");
  };
  const login = useGoogleLogin({
    scope: "https://www.googleapis.com/auth/contacts",
    onSuccess: handleLoginSuccess,
    onError: handleLoginFailure,
  });

  const validPassword = password === access_password;

  const handleLogin = (): void => {
    if (!validPassword) return;

    login();
  };

  useEffect(() => {
    if (token) {
      axios
        .get("https://people.googleapis.com/v1/contactGroups", {
          headers: {
            Authorization: `Bearer ${token?.access_token}`,
            "Content-Type": "application/json",
          },
        })
        .then((response) => {
          const groups = response.data.contactGroups;

          setGroup(groups);
        });
    }
  }, [token]);

  if (!token) {
    return (
      <div className="max-w[960px] mx-auto grid place-items-center h-dvh">
        <div className="flex flex-col">
          <img
            src={
              "https://cdn.beacons.ai/user_content/QoZ2OcuxAhdw7GD5YSwonWZHnN33/profile_fenixplataformadecredito.png?q=1725114747.4797835"
            }
            className="w-32 h-32 mx-auto mb-4 rounded-full"
          />
          <h2 className="font-bold text-lg mb-4">
            Clique no botão para fazer login
          </h2>
          <Input
            type={"password"}
            placeholder="Password"
            value={password}
            className="mb-2"
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            className="bg-orange-600 hover:bg-orange-700 text-white hover:text-white font-medium"
            variant={"outline"}
            onClick={handleLogin}
            disabled={!validPassword}
          >
            Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className={`w-[960px] mx-auto grid place-items-center h-dvh`}>
      <Card className="w-full p-4">
        <CardContent>
          <div className="space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? "border-primary bg-primary/10"
                  : "border-gray-300 hover:border-primary"
              }`}
            >
              <input {...getInputProps()} />
              {file ? (
                <div className="flex flex-col items-center">
                  <File className="w-12 h-12 text-primary mb-2" />
                  <p className="text-sm font-medium">{file.name}</p>
                </div>
              ) : isDragActive ? (
                <div className="flex flex-col items-center">
                  <Upload className="w-12 h-12 text-primary mb-2" />
                  <p className="text-sm font-medium">Solte o arquivo aqui</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <Upload className="w-12 h-12 text-gray-400 mb-2" />
                  <p className="text-sm font-medium">
                    Arraste e solte a planilha aqui, ou clique para selecionar
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Formatos aceitos: .csv, .xlsx, .xls
                  </p>
                </div>
              )}
            </div>
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              {uploading ? "Enviando..." : "Enviar Planilha"}
            </Button>
            {uploading && (
              <div className="space-y-2">
                <Progress value={overallProgress} className="w-full" />
                <p className="text-sm text-center text-muted-foreground">
                  {Math.round(overallProgress)}% concluído
                </p>
              </div>
            )}
            {message && (
              <div className="flex items-center justify-center space-x-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <p className="text-muted-foreground">{message}</p>
              </div>
            )}
            {contacts.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-2">
                  Lista de Contatos
                </h3>
                <ul className="space-y-2">
                  {contacts.map((contact) => (
                    <li
                      key={contact.id}
                      className="flex items-center justify-between p-2 bg-gray-100 rounded"
                    >
                      <span>
                        {contact.name} - {contact.phone}
                      </span>
                      <div className="flex items-center space-x-2">
                        {contact.status === "waiting button click" && (
                          <PlayCircle className="w-4 h-4 text-gray-400" />
                        )}
                        {contact.status === "uploading" && (
                          <div className="w-16">
                            <Progress
                              value={contact.progress}
                              className="h-2"
                            />
                          </div>
                        )}
                        {contact.status === "completed" && (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        )}
                        {contact.status === "error" && (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-xs text-gray-500">
                          {contact.status === "uploading"
                            ? `${contact.progress}%`
                            : contact.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default App;
