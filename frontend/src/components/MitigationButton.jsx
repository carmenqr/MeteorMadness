import { useNavigate } from "react-router-dom";

export default function GoToMitigationButton() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/mitigation")}>Go to Mitigation</button>;
}